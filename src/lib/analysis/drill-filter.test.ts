import { expect, test } from 'vitest';

import type { OpeningBook } from '@/lib/chess/openings';
import { fenAt, OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import { drillsOf } from './drill';
import {
  drillHash,
  drillLabel,
  filterDrills,
  isFiltered,
  NO_DRILL_FILTER,
  openingOfDrill,
  readDrillFilter,
  stageOfDrill,
  type DrillFilter,
} from './drill-filter';
import { OPERA_SLIPS, stored } from './fixtures';

const BLACK = 'Duke Karl / Count Isouard';

const replay = parseReplay(OPERA_GAME);
// 1.e4 e5 is all this book knows, so every Opera drill is in it.
const book: OpeningBook = {
  maxPlies: 2,
  positions: {
    [fenAt(replay, 2).split(' ').slice(0, 4).join(' ')]: "C20 King's Pawn Game",
  },
};

// 4...Bxf3 (blunder) and 7...Qe7 (mistake), both in the opening.
const opening = drillsOf(stored(OPERA_SLIPS), [BLACK]);
// 11...Nbd7 drops a knight's worth: a blunder at ply 21, in the middlegame.
const middlegame = drillsOf(
  stored({
    cps: [...Array(22).fill(0), ...Array(12).fill(400)],
    pvs: { 21: ['f6d7'] },
  }),
  [BLACK],
);
// Kb2 throws away a won pawn ending: a blunder with six pieces left, no opening.
const endgame = drillsOf(
  stored({
    replay: parseReplay(`[White "Me"]
[Black "Rival"]
[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]

1. Kb2 Kg7 *`),
    cps: [900, 100, 100],
    pvs: { 0: ['a7a8q'] },
  }),
  ['Me'],
);
const all = [...opening, ...middlegame, ...endgame];

const only = (patch: Partial<DrillFilter>) =>
  filterDrills(all, { ...NO_DRILL_FILTER, ...patch }, book).map((d) => d.id);
const ids = (drills: typeof all) => drills.map((d) => d.id);

test('the fixtures sit where they claim to', () => {
  expect(opening.map((d) => d.grade)).toEqual(['blunder', 'mistake']);
  expect(all.map(stageOfDrill)).toEqual([
    'opening',
    'opening',
    'middlegame',
    'endgame',
  ]);
});

test('no filter keeps every drill in order', () => {
  expect(only({})).toEqual(ids(all));
  expect(isFiltered(NO_DRILL_FILTER)).toBe(false);
});

test('a grade keeps only drills of that grade', () => {
  expect(only({ grade: 'mistake' })).toEqual(ids([opening[1]!]));
  expect(only({ grade: 'blunder' })).toEqual(
    ids([opening[0]!, middlegame[0]!, endgame[0]!]),
  );
  expect(only({ grade: 'miss' })).toEqual([]);
});

test('a stage keeps only drills from that stage of the game', () => {
  expect(only({ stage: 'opening' })).toEqual(ids(opening));
  expect(only({ stage: 'middlegame' })).toEqual(ids(middlegame));
  expect(only({ stage: 'endgame' })).toEqual(ids(endgame));
});

test('an opening keeps only drills from games in it', () => {
  expect(openingOfDrill(opening[0]!, book)).toBe("King's Pawn Game");
  expect(openingOfDrill(endgame[0]!, book)).toBeNull();
  expect(only({ opening: "King's Pawn Game" })).toEqual(
    ids([...opening, ...middlegame]),
  );
  expect(only({ opening: 'Sicilian Defense' })).toEqual([]);
});

test('without the book an opening is named by the PGN header', () => {
  const named = drillsOf(
    stored({
      ...OPERA_SLIPS,
      replay: parseReplay(`[Opening "Philidor Defense"]\n${OPERA_GAME}`),
    }),
    [BLACK],
  );
  expect(openingOfDrill(named[0]!, null)).toBe('Philidor Defense');
});

test('filters combine: a drill must pass all of them', () => {
  expect(only({ grade: 'blunder', stage: 'opening' })).toEqual(
    ids([opening[0]!]),
  );
  expect(only({ grade: 'blunder', opening: "King's Pawn Game" })).toEqual(
    ids([opening[0]!, middlegame[0]!]),
  );
  expect(
    only({
      grade: 'mistake',
      stage: 'middlegame',
      opening: "King's Pawn Game",
    }),
  ).toEqual([]);
});

test('the query sets the filter, and the filter writes back the same query', () => {
  const filter = readDrillFilter(
    new URLSearchParams(
      'grade=blunder&stage=opening&opening=Sicilian+Defense&side=b&speed=blitz',
    ),
  );
  expect(filter).toEqual({
    grade: 'blunder',
    stage: 'opening',
    opening: 'Sicilian Defense',
    side: 'b',
    speed: 'blitz',
  });
  expect(isFiltered(filter)).toBe(true);
  expect(drillHash(filter)).toBe(
    '/drill?grade=blunder&stage=opening&opening=Sicilian+Defense&side=b&speed=blitz',
  );
  expect(
    readDrillFilter(new URLSearchParams(drillHash(filter).split('?')[1])),
  ).toEqual(filter);
});

test('an unknown value in the query reads as any', () => {
  expect(
    readDrillFilter(
      new URLSearchParams('grade=great&stage=late&opening=&side=x&speed=fast'),
    ),
  ).toEqual(NO_DRILL_FILTER);
  expect(drillHash(NO_DRILL_FILTER)).toBe('/drill');
});

test('a side keeps only drills played as that colour', () => {
  expect(only({ side: 'b' })).toEqual(ids([...opening, ...middlegame]));
  expect(only({ side: 'w' })).toEqual(ids(endgame));
});

test('a speed keeps only drills from games at that speed', () => {
  const blitz = drillsOf(
    stored({
      ...OPERA_SLIPS,
      replay: parseReplay(
        OPERA_GAME.replace('[Result', '[TimeControl "300+3"]\n[Result'),
      ),
    }),
    [BLACK],
  );
  const mixed = [...blitz, ...endgame];
  const keep = (speed: DrillFilter['speed']) =>
    filterDrills(mixed, { ...NO_DRILL_FILTER, speed }, book);
  expect(keep('blitz')).toEqual(blitz);
  expect(keep('bullet')).toEqual([]);
  expect(keep('all')).toEqual(mixed);
});

test('an opening matches however the Overview would spell it', () => {
  expect(only({ opening: 'kings pawn game' })).toEqual(
    ids([...opening, ...middlegame]),
  );
});

test('a label says what the filter holds', () => {
  const label = (patch: Partial<DrillFilter>, n: number) =>
    drillLabel({ ...NO_DRILL_FILTER, ...patch }, n);
  expect(label({ opening: 'Caro-Kann Defense' }, 6)).toBe(
    '6 Caro-Kann Defense mistakes',
  );
  expect(label({ stage: 'middlegame' }, 1)).toBe('1 middlegame mistake');
  expect(label({ grade: 'miss', stage: 'endgame' }, 2)).toBe(
    '2 endgame misses',
  );
});
