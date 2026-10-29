// The imperative shell around the analysis document. Owns the per-position
// records, the lanes, job ids, and the flush cadence. What to search next is
// schedule.ts; how results merge is mergeLine/settle below.

import type { Line } from '@/lib/chess/score';
import { fenAt, type Replay } from '@/lib/chess/replay';

import {
  CACHE_VERSION,
  gameKey,
  type AnalysisStore,
  type GameKey,
  type StoredAnalysis,
} from './cache';
import type { GameAnalysis, PositionAnalysis } from './game-analysis';
import { searchInputAt } from './inputs';
import {
  ANALYSIS_LEVELS,
  LEVELS,
  rank,
  satisfies,
  type AnalysisLevel,
} from './levels';
import {
  spawnWorkerLane,
  type FromEngine,
  type Lane,
  type SpawnLane,
} from './protocol';
import { FOCUS_DWELL_MS, plan, type Command } from './schedule';

/** What the analyzer needs from a loaded game. `Loaded` satisfies it. */
export type AnalysisGame = { id: number; replay: Replay };

export type Analyzer = {
  /**
   * "The user is looking at position `index` of `game`." Idempotent. A new
   * game id terminates running jobs and starts a fresh document. Analysis
   * keeps going after the caller unmounts, until the game is complete.
   */
  view(game: AnalysisGame, index: number): void;
  /**
   * Mirrors the user's setting. Keeps every line; jobs above the new level
   * are terminated since they would overshoot it.
   */
  setLevel(level: AnalysisLevel): void;
  subscribe(listener: () => void): () => void;
  /** Stable between flushes. null before the first view(). */
  getSnapshot(): GameAnalysis | null;
  /** Stops lanes and timers but keeps results; a later view() resumes (StrictMode-safe). */
  dispose(): void;
  /**
   * Stops the game and drops it. A load or a search that finishes afterwards
   * cannot save, because the document it was writing is gone.
   */
  drop(): void;
};

export type AnalyzerOptions = {
  level: AnalysisLevel;
  /** Defaults to Web Workers; null means analysis is unavailable. */
  spawn?: SpawnLane | null;
  /** Defaults to one per core but one, capped at 8. */
  lanes?: number;
  /** Finished games are saved here and looked up before searching. Defaults to none. */
  store?: AnalysisStore | null;
};

/** Snapshots are rebuilt at most this often; iterations arrive far faster than React needs. */
export const FLUSH_MS = 50;

/** A saved analysis that takes longer than this to arrive no longer holds up the engine. */
export const CACHE_LOAD_MS = 1500;

/** Monotone per position: `line` only deepens, `settled` only rises. */
type Entry = {
  line: Line | null;
  settled: AnalysisLevel | null;
  failed: boolean;
  /** Lanes that died searching this position. */
  crashes: number;
};
type Slot = {
  lane: Lane | null;
  job: { jobId: number; index: number; level: AnalysisLevel } | null;
};
type Game = {
  id: number;
  replay: Replay;
  key: GameKey;
  inputs: { fen: string; history: string[] }[];
  entries: Entry[];
  focus: number;
  /** The user has stayed on `focus` for FOCUS_DWELL_MS. */
  dwelled: boolean;
  /** Waiting on the saved analysis; nothing is searched until it arrives or CACHE_LOAD_MS passes. */
  loading: boolean;
  /** The level last saved or loaded for this game, so neither is saved again. */
  saved: AnalysisLevel | null;
};

/** Gives up on the engine after this many crashes before any lane answers (the worker bundle fails to load). */
const MAX_LOAD_CRASHES = 5;
/** A position that kills this many lanes is marked failed instead of retried. */
const MAX_POSITION_CRASHES = 2;

export function createAnalyzer({
  level: initial,
  spawn = spawnWorkerLane,
  lanes,
  store = null,
}: AnalyzerOptions): Analyzer {
  const count =
    lanes ??
    Math.max(
      1,
      Math.min(8, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1),
    );
  const slots: Slot[] = Array.from({ length: count }, () => ({
    lane: null,
    job: null,
  }));
  const listeners = new Set<() => void>();
  let level = initial;
  let game: Game | null = null;
  let snapshot: GameAnalysis | null = null;
  let nextJobId = 1;
  let started = false;
  let loadCrashes = 0;
  let disposed = false;
  const unavailable = () => !spawn || loadCrashes >= MAX_LOAD_CRASHES;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let dwellTimer: ReturnType<typeof setTimeout> | undefined;

  function stop(slot: Slot) {
    slot.lane?.terminate();
    slot.lane = null;
    slot.job = null;
  }

  function markDirty() {
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      if (!game) return;
      snapshot = toSnapshot(game, level, slots, unavailable());
      listeners.forEach((l) => l());
    }, FLUSH_MS);
  }

  function replan() {
    if (!game || game.loading || unavailable()) return;
    persist(game);
    const commands = plan({
      level,
      focus: game.focus,
      focusDwelled: game.dwelled,
      settled: game.entries.map((e) => (e.failed ? LEVELS.at(-1)! : e.settled)),
      running: slots.map((s) => s.job?.index ?? null),
    });
    commands.forEach(execute);
    if (commands.length) markDirty();
  }

  /**
   * Saves a finished game once per level reached. A position that never
   * settled is stored as a gap, so the lines that did settle are kept.
   * A game with no settled line is not saved. Fire and forget: the cache
   * never blocks a review.
   */
  function persist(target: Game) {
    if (!store) return;
    const { entries } = target;
    if (
      !entries.every(
        (e) => e.failed || (e.line && satisfies(e.settled, level)),
      )
    )
      return;
    // A later search can fail after a line already settled. Keep that line.
    // Only a position that never settled is a gap.
    const lines = entries.map((e) =>
      e.failed ? (e.settled && e.line ? e.line : null) : e.line!,
    );
    const settled = lines.flatMap((line, i) => {
      const at = entries[i]!.settled;
      return line && at ? [at] : [];
    });
    if (settled.length === 0) return;
    const lowest = settled.reduce((low, at) =>
      rank(at) < rank(low) ? at : low,
    );
    if (satisfies(target.saved, lowest)) return;
    target.saved = lowest;
    const record: StoredAnalysis = {
      v: CACHE_VERSION,
      key: target.key,
      level: lowest,
      lines,
      replay: target.replay,
      analyzedAt: Date.now(),
    };
    store.save(record).catch(() => {});
  }

  /** Looks the game up and merges what is found. A hit that arrives after the timeout merges the same way. */
  function restore(target: Game) {
    const resume = () => {
      target.loading = false;
      if (disposed) return;
      markDirty();
      replan();
    };
    const timer = setTimeout(() => {
      if (game === target && target.loading) resume();
    }, CACHE_LOAD_MS);
    Promise.resolve()
      .then(() => store!.load(target.key))
      .catch(() => null)
      .then((record) => {
        clearTimeout(timer);
        if (game !== target) return;
        const hit = record && record.lines.length === target.entries.length;
        if (hit) {
          record.lines.forEach((line, i) => {
            const entry = target.entries[i]!;
            if (!line) {
              if (!entry.line) entry.failed = true;
              return;
            }
            entry.line = mergeLine(entry.line, line);
            entry.settled = settle(entry.settled, record.level);
          });
          // A side chosen anew is saved again, even at the level already there.
          const sideChanged =
            target.replay.mine !== undefined &&
            target.replay.mine !== record.replay.mine;
          if (!sideChanged) target.saved = settle(target.saved, record.level);
        }
        if (hit || target.loading) resume();
      });
  }

  function execute({ kind, slot: i, index, level: at }: Command) {
    const slot = slots[i]!;
    if (kind === 'preempt') stop(slot);
    slot.lane ??= spawn!(
      (message) => onMessage(slot, message),
      () => onCrash(slot),
    );
    const jobId = nextJobId++;
    slot.job = { jobId, index, level: at };
    slot.lane.post({
      jobId,
      ...game!.inputs[index]!,
      ...ANALYSIS_LEVELS[at].limits,
    });
  }

  function onMessage(slot: Slot, message: FromEngine) {
    started = true;
    const job = slot.job;
    if (!game || !job || job.jobId !== message.jobId) return; // stale: a terminated or finished job
    const entry = game.entries[job.index]!;
    if (message.kind === 'line') {
      entry.line = mergeLine(entry.line, message.line);
    } else {
      if (message.kind === 'done') {
        entry.line = mergeLine(entry.line, lineOf(message.outcome));
        entry.settled = settle(entry.settled, job.level);
      } else {
        entry.failed = true;
      }
      slot.job = null;
      replan();
    }
    markDirty();
  }

  function onCrash(slot: Slot) {
    const job = slot.job;
    stop(slot); // an uncaught error leaves the worker alive
    if (!started) loadCrashes++;
    if (game && job) {
      const entry = game.entries[job.index]!;
      if (++entry.crashes >= MAX_POSITION_CRASHES) entry.failed = true;
    }
    markDirty();
    replan();
  }

  function focusOn(index: number) {
    game!.focus = index;
    game!.dwelled = false;
    clearTimeout(dwellTimer);
    dwellTimer = setTimeout(() => {
      game!.dwelled = true;
      replan();
    }, FOCUS_DWELL_MS);
  }

  return {
    view(next, index) {
      disposed = false;
      if (next.id !== game?.id) {
        slots.forEach((s) => s.job && stop(s));
        game = {
          id: next.id,
          replay: next.replay,
          key: gameKey(next.replay),
          inputs: positionsOf(next.replay),
          entries: Array.from({ length: next.replay.plies.length + 1 }, () => ({
            line: null,
            settled: null,
            failed: false,
            crashes: 0,
          })),
          focus: index,
          dwelled: false,
          loading: store !== null,
          saved: null,
        };
        focusOn(index);
        if (store) restore(game);
      } else if (index !== game.focus) {
        focusOn(index);
      }
      markDirty();
      replan();
    },
    setLevel(next) {
      if (next === level) return;
      level = next;
      slots.forEach((s) => s.job && rank(s.job.level) > rank(next) && stop(s));
      markDirty();
      replan();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    dispose() {
      disposed = true;
      slots.forEach(stop);
      clearTimeout(flushTimer);
      clearTimeout(dwellTimer);
      flushTimer = undefined;
      // A resumed view() of the same position starts no new dwell timer.
      if (game) game.dwelled = true;
    },
    drop() {
      disposed = true;
      slots.forEach(stop);
      clearTimeout(flushTimer);
      clearTimeout(dwellTimer);
      flushTimer = undefined;
      game = null;
      snapshot = null;
      listeners.forEach((l) => l());
    },
  };
}

/** Keeps the deeper line; on equal depth the newer one. */
function mergeLine(have: Line | null, next: Line): Line {
  return have && have.depth > next.depth ? have : next;
}

/** A time or node cap is part of the line. Depth and mate are not. */
function lineOf(outcome: { line: Line; reason: string }): Line {
  const { line, reason } = outcome;
  return reason === 'time' || reason === 'nodes'
    ? { ...line, capped: reason }
    : line;
}

function settle(
  have: AnalysisLevel | null,
  next: AnalysisLevel,
): AnalysisLevel {
  return satisfies(have, next) ? have! : next;
}

function positionsOf(replay: Replay): Game['inputs'] {
  const fens = Array.from({ length: replay.plies.length + 1 }, (_, i) =>
    fenAt(replay, i),
  );
  return fens.map((_, i) => searchInputAt(fens, i));
}

function toSnapshot(
  game: Game,
  level: AnalysisLevel,
  slots: readonly Slot[],
  unavailable: boolean,
): GameAnalysis {
  const searching = new Set(slots.map((s) => s.job?.index));
  let done = 0;
  const positions = game.entries.map((entry, i): PositionAnalysis => {
    if (entry.failed) {
      done++;
      return { status: 'failed' };
    }
    if (entry.line && satisfies(entry.settled, level)) {
      done++;
      return { status: 'done', line: entry.line };
    }
    return {
      status: searching.has(i) ? 'searching' : 'queued',
      line: entry.line,
    };
  });
  return { gameId: game.id, level, positions, done, unavailable };
}
