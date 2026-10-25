// A one-lane analyzer for positions that are not part of the game: the ones a
// side line reaches. It looks at one position at a time, redirects (and
// cancels) when asked about another, and remembers every position it finished
// so stepping back and forth through a line costs nothing.

import type { Line } from '@/lib/chess/score';

import { ANALYSIS_LEVELS, type AnalysisLevel } from './levels';
import {
  spawnWorkerLane,
  type FromEngine,
  type Lane,
  type SpawnLane,
} from './protocol';
import { FLUSH_MS } from './analyzer';

export type ProbeInput = { fen: string; history: readonly string[] };

export type ProbeSnapshot = {
  /** The position last asked about; null when idle. */
  fen: string | null;
  /** The deepest line so far for `fen`. */
  line: Line | null;
  /** `line` is final at the requested level. */
  done: boolean;
  /** Final lines for every position finished at this level, by FEN. */
  settled: ReadonlyMap<string, Line>;
  /** The engine cannot run in this browser. */
  unavailable: boolean;
};

export type Probe = {
  /** Idempotent for the same FEN. null cancels and goes idle. */
  look(input: ProbeInput | null): void;
  /** Lines found at another level are dropped and the current position is searched again. */
  setLevel(level: AnalysisLevel): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ProbeSnapshot;
  dispose(): void;
};

/** A position the user is still scrolling past is not worth a search. */
export const PROBE_DWELL_MS = 150;

export function createProbe({
  level: initial,
  spawn = spawnWorkerLane,
}: {
  level: AnalysisLevel;
  spawn?: SpawnLane | null;
}): Probe {
  const listeners = new Set<() => void>();
  const settled = new Map<string, Line>();
  let level = initial;
  let input: ProbeInput | null = null;
  let line: Line | null = null;
  let done = false;
  let unavailable = !spawn;
  let lane: Lane | null = null;
  let jobId = 0;
  let running = false;
  /** The position the job in flight is searching. */
  let searching: ProbeInput | null = null;
  let snapshot = take();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let dwellTimer: ReturnType<typeof setTimeout> | undefined;

  function take(): ProbeSnapshot {
    return {
      fen: input?.fen ?? null,
      line,
      done,
      settled: new Map(settled),
      unavailable,
    };
  }

  function markDirty() {
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      snapshot = take();
      listeners.forEach((l) => l());
    }, FLUSH_MS);
  }

  function stopLane() {
    lane?.terminate();
    lane = null;
    running = false;
    jobId++;
  }

  function start() {
    if (!input || !spawn || done) return;
    const target = input;
    // The lane outlives its jobs, so its handler cannot close over one target:
    // a message belongs to the job in flight, named by `jobId`.
    lane ??= spawn(
      (message: FromEngine) => {
        if (message.jobId !== jobId || !searching) return;
        if (message.kind === 'line') {
          line = message.line;
        } else {
          if (message.kind === 'done') {
            line = message.outcome.line;
            settled.set(searching.fen, line);
          }
          done = true;
          running = false;
        }
        markDirty();
      },
      () => {
        lane = null;
        running = false;
        done = true;
        unavailable = true;
        markDirty();
      },
    );
    searching = target;
    running = true;
    lane.post({
      jobId: ++jobId,
      fen: target.fen,
      history: target.history,
      ...ANALYSIS_LEVELS[level].limits,
    });
  }

  function aim(next: ProbeInput | null) {
    clearTimeout(dwellTimer);
    if (running) stopLane();
    input = next;
    line = next ? (settled.get(next.fen) ?? null) : null;
    done = next ? settled.has(next.fen) : false;
    unavailable = !spawn;
    if (next && !done) dwellTimer = setTimeout(start, PROBE_DWELL_MS);
    markDirty();
  }

  return {
    look(next) {
      if ((next?.fen ?? null) === (input?.fen ?? null)) return;
      aim(next);
    },
    setLevel(next) {
      if (next === level) return;
      level = next;
      settled.clear();
      aim(input);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    dispose() {
      clearTimeout(dwellTimer);
      clearTimeout(flushTimer);
      flushTimer = undefined;
      stopLane();
      input = null;
    },
  };
}
