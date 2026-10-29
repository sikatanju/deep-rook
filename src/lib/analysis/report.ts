// The review layer over the analysis document: the eval graph's series and
// the game report, both derived pure from one GameAnalysis snapshot and the
// grades it produces. Nothing here knows React; the Viewer memoizes these the
// same way it memoizes `grades`, so streaming flushes just re-derive.

import type { Replay } from '@/lib/chess/replay';
import { winPercent } from '@/lib/chess/score';

import type { Classification } from './classify';
import type { GameAnalysis, PositionAnalysis } from './game-analysis';

/**
 * White's win% per position, index-aligned with `positions`
 * (length = plies + 1): `winPercent(line.score)` where the position is
 * settled ('done'), null for 'queued', 'searching', and 'failed'. The length
 * is fixed for a game; streaming only flips null → number, so every x
 * coordinate of the graph is stable.
 */
export type EvalSeries = readonly (number | null)[];

/** winPercent for settled positions, null otherwise. */
export function evalSeries(positions: readonly PositionAnalysis[]): EvalSeries {
  return positions.map((p) =>
    p.status === 'done' ? winPercent(p.line.score) : null,
  );
}

/** One player's half of the report. */
export type PlayerReport = {
  /**
   * Estimated accuracy, 0..100: the arithmetic mean over this color's graded
   * plies of `clamp(103.1668·exp(−0.04354·loss) − 3.1669, 0, 100)`, where
   * `loss` is the mover's win-chance loss in percentage points. An estimate
   * on the Lichess curve, not ground truth; the UI labels it "est.".
   * null while the color has no graded plies.
   */
  accuracy: number | null;
  /** How many plies of this color contributed (denominator of the mean). */
  gradedPlies: number;
  /** All nine grades, zeros included — a complete record, stable shape. */
  counts: Record<Classification, number>;
};

/** A moment worth jumping to. Indices are viewer position indices. */
export type KeyMoment = {
  /** The position AFTER the move (ply + 1) — a ready-made goTo target. */
  index: number;
  /** 1-based fullmove number for display ("14." / "14…"). */
  moveNumber: number;
  /** Mover's color. */
  color: 'w' | 'b';
  /** The SAN played. */
  san: string;
  grade: Classification;
  /** Win-chance points the mover lost (>= 0). Ranking key. */
  loss: number;
};

export type GameReport = {
  white: PlayerReport;
  black: PlayerReport;
  /**
   * Negative moments only — grades 'mistake', 'miss', 'blunder' — ranked by
   * loss descending, ties by earlier ply, top 5 kept, displayed
   * chronologically. Brilliant/great surface as counts and badges instead:
   * loss cannot rank them (a brilliant can cost ~0).
   */
  keyMoments: readonly KeyMoment[];
  /** Positions with status 'done' or 'failed'. */
  settled: number;
  /** positions.length. */
  total: number;
};

/** A per-color accumulator: the mean's parts plus the grade bag. */
type Tally = {
  sum: number;
  graded: number;
  counts: Record<Classification, number>;
};

/** All nine grades at zero, so the bag's shape never depends on the game. */
function newTally(): Tally {
  return {
    sum: 0,
    graded: 0,
    counts: {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
    },
  };
}

/** The pinned per-move accuracy estimate; see PlayerReport.accuracy. */
function moveAccuracy(loss: number): number {
  return Math.min(
    100,
    Math.max(0, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669),
  );
}

/** Grades that make a moment worth jumping to. */
export const MOMENT_GRADES = new Set<Classification>([
  'mistake',
  'miss',
  'blunder',
]);

/**
 * Every graded ply as a moment, in game order. `grades` must be
 * classifyMoves(replay, positions) from the SAME snapshot; a ply is skipped
 * defensively unless the grade and both its bracketing series values are
 * non-null. The loss uses classify's sign rule: max(0, mover win% before −
 * after).
 */
function gradedMoments(
  replay: Replay,
  positions: readonly PositionAnalysis[],
  grades: readonly (Classification | null)[],
): KeyMoment[] {
  const series = evalSeries(positions);
  const moments: KeyMoment[] = [];
  for (let p = 0; p < grades.length && p < replay.plies.length; p++) {
    const grade = grades[p];
    if (!grade) continue;
    // Out-of-range indexes read as undefined; collapsing them into null keeps
    // one "no settled point here" path (the same trick as the graph's point()).
    const before = series[p] ?? null;
    const after = series[p + 1] ?? null;
    if (before === null || after === null) continue;
    const ply = replay.plies[p]!;
    const sign = ply.color === 'w' ? 1 : -1;
    moments.push({
      index: p + 1,
      moveNumber: ply.moveNumber,
      color: ply.color,
      san: ply.san,
      grade,
      loss: Math.max(0, sign * (before - after)),
    });
  }
  return moments;
}

/** Every mistake, miss and blunder of both colors, uncapped, in game order. */
export function mistakesOf(
  replay: Replay,
  positions: readonly PositionAnalysis[],
  grades: readonly (Classification | null)[],
): KeyMoment[] {
  return gradedMoments(replay, positions, grades).filter((m) =>
    MOMENT_GRADES.has(m.grade),
  );
}

/** Derives the whole report, under the same contract as `gradedMoments`. */
export function gameReport(
  replay: Replay,
  positions: readonly PositionAnalysis[],
  grades: readonly (Classification | null)[],
): GameReport {
  const sides: Record<'w' | 'b', Tally> = { w: newTally(), b: newTally() };
  const moments = gradedMoments(replay, positions, grades);
  for (const { color, grade, loss } of moments) {
    const side = sides[color];
    side.counts[grade]++;
    side.sum += moveAccuracy(loss);
    side.graded++;
  }

  const keyMoments = moments
    .filter((m) => MOMENT_GRADES.has(m.grade))
    .sort((a, b) => b.loss - a.loss || a.index - b.index)
    .slice(0, 5)
    .sort((a, b) => a.index - b.index);

  const toReport = (side: Tally): PlayerReport => ({
    accuracy: side.graded ? side.sum / side.graded : null,
    gradedPlies: side.graded,
    counts: side.counts,
  });

  return {
    white: toReport(sides.w),
    black: toReport(sides.b),
    keyMoments,
    settled: positions.filter(
      (p) => p.status === 'done' || p.status === 'failed',
    ).length,
    total: positions.length,
  };
}

/**
 * Where the scheduler's work stands, from the document alone (the UI never
 * sees the scheduler). Outstanding work in priority order:
 *
 * - `focus`: the viewed position is not settled yet.
 * - `first-light`: some position has no line at all.
 * - `upgrade`: every position has a line, but some are below the requested level.
 * - `done`: everything settled.
 *
 * The scheduler runs these side by side on different lanes; this names the
 * most urgent one still open.
 */
export type AnalysisPhase = 'focus' | 'first-light' | 'upgrade' | 'done';

export function analysisPhase(
  analysis: Pick<GameAnalysis, 'positions' | 'done'>,
  index: number,
): AnalysisPhase {
  const { positions } = analysis;
  if (analysis.done >= positions.length) return 'done';
  const here = positions[index];
  if (here && here.status !== 'done' && here.status !== 'failed')
    return 'focus';
  const blank = positions.some((p) => p.status === 'queued' && p.line === null);
  return blank ? 'first-light' : 'upgrade';
}

/** Grades the next-mistake walk stops on: the moment grades, plus inaccuracies. */
const WALK_GRADES = new Set<Classification>(['inaccuracy', ...MOMENT_GRADES]);

/** Restricts a walk over the grades to one side's moves. */
export type OnlySide = {
  side: 'w' | 'b';
  /** The game's plies, for who played each; `grades[p]` is `plies[p]`'s. */
  plies: readonly { color: 'w' | 'b' }[];
};

const walkable = (
  grades: readonly (Classification | null)[],
  ply: number,
  only?: OnlySide,
) => {
  const grade = grades[ply];
  return (
    !!grade &&
    WALK_GRADES.has(grade) &&
    (!only || only.plies[ply]?.color === only.side)
  );
};

/**
 * The next position index after `index` whose move is an inaccuracy, mistake,
 * miss or blunder, or null. With `only`, just that side's moves count.
 */
export function nextMistake(
  grades: readonly (Classification | null)[],
  index: number,
  only?: OnlySide,
): number | null {
  for (let ply = index; ply < grades.length; ply++)
    if (walkable(grades, ply, only)) return ply + 1;
  return null;
}

/** The position index of the closest such move before the one that led to `index`, or null. */
export function previousMistake(
  grades: readonly (Classification | null)[],
  index: number,
  only?: OnlySide,
): number | null {
  for (let ply = Math.min(index, grades.length) - 2; ply >= 0; ply--)
    if (walkable(grades, ply, only)) return ply + 1;
  return null;
}
