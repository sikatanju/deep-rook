// Narrowing the drill queue to one weakness: a grade, a stage of the game, an
// opening. The filter lives in the drill route's query, so a link from another
// page can open a filtered queue. Pure.

import { openingOf, type OpeningBook } from '@/lib/chess/openings';
import { openingName } from '@/lib/chess/replay';
import { stageAt, STAGES, type Stage } from '@/lib/chess/stage';

import type { Drill, DrillGrade } from './drill';

export type DrillFilter = {
  grade: DrillGrade | 'all';
  stage: Stage | 'all';
  /** An opening's name; null for any. */
  opening: string | null;
};

export const NO_DRILL_FILTER: DrillFilter = {
  grade: 'all',
  stage: 'all',
  opening: null,
};

export const DRILL_GRADES = ['mistake', 'miss', 'blunder'] as const;
export const DRILL_STAGES = Object.keys(STAGES) as Stage[];

/** The stage of the position the drill asks about, as the Overview counts it. */
export const stageOfDrill = (drill: Drill): Stage =>
  stageAt(drill.fen, drill.index - 1);

/** The opening's name by position when the `book` has loaded, else the PGN header. */
export const openingOfDrill = (
  drill: Drill,
  book: OpeningBook | null,
): string | null => {
  const { replay } = drill.record;
  return (book && openingOf(replay, book)?.name) ?? openingName(replay.headers);
};

export const isFiltered = (filter: DrillFilter) =>
  filter.grade !== 'all' || filter.stage !== 'all' || filter.opening !== null;

/** `drills` that pass every part of `filter`, in their order. */
export const filterDrills = (
  drills: readonly Drill[],
  filter: DrillFilter,
  book: OpeningBook | null,
): Drill[] =>
  drills.filter(
    (drill) =>
      (filter.grade === 'all' || drill.grade === filter.grade) &&
      (filter.stage === 'all' || stageOfDrill(drill) === filter.stage) &&
      (filter.opening === null ||
        openingOfDrill(drill, book) === filter.opening),
  );

/** The filter a query asks for; a value it does not know reads as any. */
export function readDrillFilter(params: URLSearchParams): DrillFilter {
  const grade = params.get('grade');
  const stage = params.get('stage');
  return {
    grade: DRILL_GRADES.find((g) => g === grade) ?? 'all',
    stage: DRILL_STAGES.find((s) => s === stage) ?? 'all',
    opening: params.get('opening') || null,
  };
}

/** The drill route's hash for `filter`: `/drill?grade=blunder&stage=opening`. */
export function drillHash(filter: DrillFilter): string {
  const params = new URLSearchParams();
  if (filter.grade !== 'all') params.set('grade', filter.grade);
  if (filter.stage !== 'all') params.set('stage', filter.stage);
  if (filter.opening !== null) params.set('opening', filter.opening);
  const query = params.toString();
  return query ? `/drill?${query}` : '/drill';
}
