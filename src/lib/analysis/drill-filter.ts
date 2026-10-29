// Narrowing the drill queue to one weakness: a grade, a stage of the game, an
// opening, the side played, the speed of the game. The filter lives in the
// drill route's query, so a link from another page can open a filtered queue.
// Pure.

import { timeClassOf } from '@/lib/chess/clock';
import { openingOf, type OpeningBook } from '@/lib/chess/openings';
import { openingName } from '@/lib/chess/replay';
import { stageAt, STAGES, type Stage } from '@/lib/chess/stage';
import { SPEEDS } from '@/lib/chesscom/list-filter';
import type { TimeClass } from '@/lib/chesscom/types';

import type { Drill, DrillGrade } from './drill';
import { openingKey } from './overview';

export type DrillFilter = {
  grade: DrillGrade | 'all';
  stage: Stage | 'all';
  /** An opening's name; null for any. */
  opening: string | null;
  side: 'w' | 'b' | 'all';
  speed: TimeClass | 'all';
};

export const NO_DRILL_FILTER: DrillFilter = {
  grade: 'all',
  stage: 'all',
  opening: null,
  side: 'all',
  speed: 'all',
};

export const DRILL_GRADES = ['mistake', 'miss', 'blunder'] as const;
export const DRILL_STAGES = Object.keys(STAGES) as Stage[];

/** The stage of the position the drill asks about, as the Overview counts it. */
export const stageOfDrill = (drill: Drill): Stage =>
  stageAt(drill.fen, drill.index - 1);

/** The speed of the drill's game; null when its PGN has no usable time control. */
export const speedOfDrill = (drill: Drill): TimeClass | null =>
  timeClassOf(drill.record.replay.headers.TimeControl);

/** The opening's name by position when the `book` has loaded, else the PGN header. */
export const openingOfDrill = (
  drill: Drill,
  book: OpeningBook | null,
): string | null => {
  const { replay } = drill.record;
  return (book && openingOf(replay, book)?.name) ?? openingName(replay.headers);
};

export const isFiltered = (filter: DrillFilter) =>
  filter.grade !== 'all' ||
  filter.stage !== 'all' ||
  filter.opening !== null ||
  filter.side !== 'all' ||
  filter.speed !== 'all';

/**
 * `drills` that pass every part of `filter`, in their order. An opening
 * matches as the Overview groups them, so one spelled with or without its
 * colons and hyphens is the same opening.
 */
export const filterDrills = (
  drills: readonly Drill[],
  filter: DrillFilter,
  book: OpeningBook | null,
): Drill[] => {
  const opening = filter.opening === null ? null : openingKey(filter.opening);
  return drills.filter(
    (drill) =>
      (filter.grade === 'all' || drill.grade === filter.grade) &&
      (filter.stage === 'all' || stageOfDrill(drill) === filter.stage) &&
      (filter.side === 'all' || drill.color === filter.side) &&
      (filter.speed === 'all' || speedOfDrill(drill) === filter.speed) &&
      (opening === null ||
        openingKey(openingOfDrill(drill, book) ?? '') === opening),
  );
};

/** The filter a query asks for; a value it does not know reads as any. */
export function readDrillFilter(params: URLSearchParams): DrillFilter {
  const grade = params.get('grade');
  const stage = params.get('stage');
  const side = params.get('side');
  const speed = params.get('speed');
  return {
    grade: DRILL_GRADES.find((g) => g === grade) ?? 'all',
    stage: DRILL_STAGES.find((s) => s === stage) ?? 'all',
    opening: params.get('opening') || null,
    side: side === 'w' || side === 'b' ? side : 'all',
    speed: SPEEDS.find((s) => s === speed) ?? 'all',
  };
}

/** The drill route's hash for `filter`: `/drill?grade=blunder&stage=opening`. */
export function drillHash(filter: DrillFilter): string {
  const params = new URLSearchParams();
  if (filter.grade !== 'all') params.set('grade', filter.grade);
  if (filter.stage !== 'all') params.set('stage', filter.stage);
  if (filter.opening !== null) params.set('opening', filter.opening);
  if (filter.side !== 'all') params.set('side', filter.side);
  if (filter.speed !== 'all') params.set('speed', filter.speed);
  const query = params.toString();
  return query ? `/drill?${query}` : '/drill';
}

const NOUNS = {
  all: ['mistake', 'mistakes'],
  mistake: ['mistake', 'mistakes'],
  miss: ['miss', 'misses'],
  blunder: ['blunder', 'blunders'],
} as const;

/** "6 Caro-Kann Defense mistakes": what `count` drills under `filter` are. */
export function drillLabel(filter: DrillFilter, count: number): string {
  const [one, many] = NOUNS[filter.grade];
  const stage =
    filter.stage === 'all' ? null : STAGES[filter.stage].label.toLowerCase();
  return [count, filter.opening, stage, count === 1 ? one : many]
    .filter((part) => part !== null)
    .join(' ');
}
