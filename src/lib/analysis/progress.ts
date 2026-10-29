// How far along an analysis is, for the progress bar. Above the lowest level
// a game takes two passes: a first look that gives every position a line, then
// a deepening to the requested level. The bar spans both, so it only moves
// forward, and the count restarts with each pass under its own label. Pure.

import type { GameAnalysis } from './game-analysis';
import { LEVELS } from './levels';

export type AnalysisProgress = {
  pass: 'First look' | 'Deepening' | 'Analyzing';
  /** Positions through the current pass. */
  done: number;
  /** Positions in the game. */
  total: number;
  /** Steps taken so far, out of `steps`, across every position and pass. */
  taken: number;
  steps: number;
};

const settled = (
  p: GameAnalysis['positions'][number],
): p is Exclude<typeof p, { status: 'queued' | 'searching' }> =>
  p.status === 'done' || p.status === 'failed';

/** Null once every position has settled. */
export function progressOf(
  analysis: Pick<GameAnalysis, 'positions' | 'level'>,
): AnalysisProgress | null {
  const { positions, level } = analysis;
  const total = positions.length;
  const twoPass = level !== LEVELS[0];
  const passes = twoPass ? 2 : 1;
  const done = positions.filter(settled).length;
  if (done === total) return null;

  const looked = positions.filter((p) => settled(p) || p.line !== null).length;
  const taken = twoPass ? looked + done : done;
  if (!twoPass)
    return { pass: 'Analyzing', done, total, taken, steps: total * passes };
  return looked < total
    ? { pass: 'First look', done: looked, total, taken, steps: total * passes }
    : { pass: 'Deepening', done, total, taken, steps: total * passes };
}

/** What the bar read at one moment. */
export type Sample = { at: number; taken: number };

/** Steps that must pass before the rate is worth trusting. */
export const MIN_STEPS = 3;

/**
 * Milliseconds left at the rate seen from `first` to `now`; null until
 * `MIN_STEPS` have passed. Rough: a deepening step takes longer than a first
 * look.
 */
export function remainingMs(
  first: Sample,
  now: Sample,
  steps: number,
): number | null {
  const gained = now.taken - first.taken;
  const elapsed = now.at - first.at;
  if (gained < MIN_STEPS || elapsed <= 0) return null;
  return ((steps - now.taken) * elapsed) / gained;
}

/** "a few seconds", "40 s", "3 min". */
export function formatRemaining(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) return 'a few seconds';
  if (seconds < 90) return `${Math.round(seconds / 5) * 5} s`;
  return `${Math.ceil(seconds / 60)} min`;
}
