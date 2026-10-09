// The imperative shell around the analysis document. Owns the per-position
// records, the lanes, job ids, and the flush cadence. What to search next is
// schedule.ts; how results merge is mergeLine/settle below.

import type { Line } from '@/lib/chess/score';
import { fenAt, type Replay } from '@/lib/chess/replay';

import type { GameAnalysis, PositionAnalysis } from './game-analysis';
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
};

export type AnalyzerOptions = {
  level: AnalysisLevel;
  /** Defaults to Web Workers; null means analysis is unavailable. */
  spawn?: SpawnLane | null;
  /** Defaults to one per core but one, capped at 8. */
  lanes?: number;
};

/** Snapshots are rebuilt at most this often; iterations arrive far faster than React needs. */
export const FLUSH_MS = 50;

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
  inputs: { fen: string; history: string[] }[];
  entries: Entry[];
  focus: number;
  /** The user has stayed on `focus` for FOCUS_DWELL_MS. */
  dwelled: boolean;
};

/** Gives up on the engine after this many crashes before any lane answers (the worker bundle fails to load). */
const MAX_LOAD_CRASHES = 5;
/** A position that kills this many lanes is marked failed instead of retried. */
const MAX_POSITION_CRASHES = 2;

export function createAnalyzer({
  level: initial,
  spawn = spawnWorkerLane,
  lanes,
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
    if (!game || unavailable()) return;
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
        entry.line = mergeLine(entry.line, message.outcome.line);
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
      if (next.id !== game?.id) {
        slots.forEach((s) => s.job && stop(s));
        game = {
          id: next.id,
          inputs: positionsOf(next.replay),
          entries: Array.from({ length: next.replay.plies.length + 1 }, () => ({
            line: null,
            settled: null,
            failed: false,
            crashes: 0,
          })),
          focus: index,
          dwelled: false,
        };
        focusOn(index);
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
      slots.forEach(stop);
      clearTimeout(flushTimer);
      clearTimeout(dwellTimer);
      flushTimer = undefined;
      // A resumed view() of the same position starts no new dwell timer.
      if (game) game.dwelled = true;
    },
  };
}

/** Keeps the deeper line; on equal depth the newer one. */
function mergeLine(have: Line | null, next: Line): Line {
  return have && have.depth > next.depth ? have : next;
}

function settle(
  have: AnalysisLevel | null,
  next: AnalysisLevel,
): AnalysisLevel {
  return satisfies(have, next) ? have! : next;
}

/**
 * Index i -> its FEN plus the game FENs back to the last irreversible move
 * (the FEN's halfmove clock), oldest first, for repetition detection.
 */
function positionsOf(replay: Replay): Game['inputs'] {
  const fens = Array.from({ length: replay.plies.length + 1 }, (_, i) =>
    fenAt(replay, i),
  );
  return fens.map((fen, i) => {
    const halfmove = Number(fen.split(' ')[4]) || 0;
    return { fen, history: fens.slice(Math.max(0, i - halfmove), i) };
  });
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
