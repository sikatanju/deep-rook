// Reviews a list of games in the background, one after another, on an
// analyzer of its own with the same store, so each game is saved the way a
// review on screen is. It gives way to the review on screen: while the
// foreground analyzer has work left, the batch stops its lanes, and it picks
// the same game back up once that work is done.

import { parseReplay, type Replay } from '@/lib/chess/replay';

import type { Analyzer } from './analyzer';
import type { GameAnalysis } from './game-analysis';
import type { AnalysisLevel } from './levels';

export type BatchGame = {
  /** The caller's id for the game, echoed in the snapshot. */
  id: string;
  /** "white vs black". */
  label: string;
  pgn: string;
};

type Counts = {
  level: AnalysisLevel;
  total: number;
  /** Games behind us, failed ones included. */
  finished: number;
  /** Games that could not be read, or that the engine failed on entirely. */
  failed: number;
};

export type BatchSnapshot =
  | { phase: 'idle' }
  | (Counts & {
      /** `yielding` while the review on screen has the engine. */
      phase: 'running' | 'yielding';
      current: {
        id: string;
        label: string;
        /** Positions settled, of `positions`. */
        done: number;
        positions: number;
      };
    })
  | (Counts & { phase: 'finished' | 'cancelled' | 'unavailable' });

export type ActiveBatch = Extract<BatchSnapshot, { current: unknown }>;
export type EndedBatch = Exclude<
  BatchSnapshot,
  ActiveBatch | { phase: 'idle' }
>;

export const isActive = (snapshot: BatchSnapshot): snapshot is ActiveBatch =>
  snapshot.phase === 'running' || snapshot.phase === 'yielding';

export type Batch = {
  /** Replaces whatever batch was running. */
  start(games: readonly BatchGame[], level: AnalysisLevel): void;
  /** Keeps the games already saved and drops the rest. */
  cancel(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): BatchSnapshot;
  dispose(): void;
};

type Current = { game: BatchGame; id: number; replay: Replay };

/** The foreground analyzer has positions left to settle. */
const busy = (analysis: GameAnalysis | null) =>
  analysis !== null &&
  !analysis.unavailable &&
  analysis.done < analysis.positions.length;

export function createBatch({
  analyzer,
  foreground,
}: {
  /** The batch's own; it views one game at a time and is disposed between batches. */
  analyzer: Analyzer;
  foreground: Pick<Analyzer, 'subscribe' | 'getSnapshot'>;
}): Batch {
  const listeners = new Set<() => void>();
  let snapshot: BatchSnapshot = { phase: 'idle' };
  let counts: Counts = { level: 'fast', total: 0, finished: 0, failed: 0 };
  let queue: BatchGame[] = [];
  let current: Current | null = null;
  let yielding = false;
  let nextId = 1;

  function publish(next: BatchSnapshot) {
    snapshot = next;
    listeners.forEach((l) => l());
  }

  function report() {
    if (!current) return;
    const analysis = analyzer.getSnapshot();
    const mine = analysis?.gameId === current.id ? analysis : null;
    publish({
      phase: yielding ? 'yielding' : 'running',
      ...counts,
      current: {
        id: current.game.id,
        label: current.game.label,
        done: mine?.done ?? 0,
        positions: current.replay.plies.length + 1,
      },
    });
  }

  /** Runs or parks the current game, whichever the foreground allows. */
  function run() {
    if (!current) return;
    yielding = busy(foreground.getSnapshot());
    if (yielding) analyzer.dispose();
    else analyzer.view({ id: current.id, replay: current.replay }, 0);
    report();
  }

  function next() {
    while (!current && queue.length > 0) {
      const game = queue.shift()!;
      try {
        current = { game, id: nextId++, replay: parseReplay(game.pgn) };
      } catch {
        counts = {
          ...counts,
          finished: counts.finished + 1,
          failed: counts.failed + 1,
        };
      }
    }
    if (current) return run();
    analyzer.dispose();
    publish({ phase: 'finished', ...counts });
  }

  function stop(phase: 'cancelled' | 'unavailable') {
    queue = [];
    current = null;
    analyzer.drop();
    publish({ phase, ...counts });
  }

  analyzer.subscribe(() => {
    const analysis = analyzer.getSnapshot();
    if (!current || analysis?.gameId !== current.id) return;
    if (analysis.unavailable) return stop('unavailable');
    if (analysis.done < analysis.positions.length) return report();
    const failed = analysis.positions.every((p) => p.status === 'failed');
    counts = {
      ...counts,
      finished: counts.finished + 1,
      failed: counts.failed + (failed ? 1 : 0),
    };
    current = null;
    next();
  });

  foreground.subscribe(() => {
    if (current && busy(foreground.getSnapshot()) !== yielding) run();
  });

  return {
    start(games, level) {
      queue = [...games];
      current = null;
      counts = { level, total: games.length, finished: 0, failed: 0 };
      analyzer.setLevel(level);
      next();
    },
    cancel() {
      if (isActive(snapshot)) stop('cancelled');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    dispose: () => analyzer.dispose(),
  };
}
