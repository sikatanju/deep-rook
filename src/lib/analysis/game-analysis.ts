// The analysis document: what the review UI reads. One per loaded game,
// produced by the analyzer, replaced (never mutated) on every flush so it
// works as a useSyncExternalStore snapshot.

import type { Line } from '@/lib/chess/score';

import type { AnalysisLevel } from './levels';

/**
 * Invariants:
 * - `positions[i]` describes `fenAt(replay, i)`; length is plies + 1.
 * - Quality is monotone per position: a later snapshot never shows a
 *   shallower line than an earlier one, and changing level never blanks a
 *   position that already has a line.
 */
export type GameAnalysis = {
  /** `Loaded.id` of the game this describes. */
  gameId: number;
  level: AnalysisLevel;
  positions: readonly PositionAnalysis[];
  /** Positions with status 'done' (or 'failed'); complete when equal to positions.length. */
  done: number;
  /** The engine cannot run in this browser; queued positions will stay queued. */
  unavailable: boolean;
};

/**
 * - queued: waiting for a worker. `line` is provisional (a lower level or a
 *   preempted search).
 * - searching: a worker is on it; `line` deepens as iterations complete.
 * - done: settled at or above the requested level.
 * - failed: the engine threw on this position.
 */
export type PositionAnalysis =
  | { status: 'queued' | 'searching'; line: Line | null }
  | { status: 'done'; line: Line }
  | { status: 'failed' };
