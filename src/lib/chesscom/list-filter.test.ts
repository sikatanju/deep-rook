import { expect, test } from 'vitest';

import {
  filterListed,
  isFiltering,
  NO_LIST_FILTER,
  type ListFilter,
} from './list-filter';
import type { Game, TimeClass } from './types';

function game(
  id: string,
  timeClass: TimeClass,
  outcome: 'win' | 'loss' | 'draw',
): Game {
  const side = (username: string, result: string) => ({
    username,
    rating: 1500,
    result,
  });
  return {
    id,
    site: 'chesscom',
    url: `https://example.test/${id}`,
    pgn: '1. e4 e5 *',
    endedAt: new Date(2026, 0, 1),
    timeControl: '180',
    timeClass,
    rated: true,
    white: side(
      'Me',
      outcome === 'win' ? 'win' : outcome === 'loss' ? 'resigned' : 'agreed',
    ),
    black: side(
      'Rival',
      outcome === 'loss' ? 'win' : outcome === 'win' ? 'resigned' : 'agreed',
    ),
  };
}

const games = [
  game('a', 'bullet', 'win'),
  game('b', 'blitz', 'loss'),
  game('c', 'blitz', 'draw'),
  game('d', 'daily', 'loss'),
  game('e', 'rapid', 'win'),
];
const ids = (filter: Partial<ListFilter>) =>
  filterListed(games, { ...NO_LIST_FILTER, ...filter }, 'me').map((g) => g.id);

test('no filter passes every game in order', () => {
  expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(isFiltering(NO_LIST_FILTER)).toBe(false);
});

test('time control keeps only that speed', () => {
  expect(ids({ speed: 'blitz' })).toEqual(['b', 'c']);
  expect(ids({ speed: 'daily' })).toEqual(['d']);
  expect(ids({ speed: 'classical' })).toEqual([]);
  expect(isFiltering({ ...NO_LIST_FILTER, speed: 'blitz' })).toBe(true);
});

test("result is read from the listed player's side, whichever colour", () => {
  expect(ids({ result: 'win' })).toEqual(['a', 'e']);
  expect(ids({ result: 'loss' })).toEqual(['b', 'd']);
  expect(ids({ result: 'draw' })).toEqual(['c']);
  const asBlack = filterListed(games, { speed: 'all', result: 'win' }, 'Rival');
  expect(asBlack.map((g) => g.id)).toEqual(['b', 'd']);
  expect(isFiltering({ ...NO_LIST_FILTER, result: 'draw' })).toBe(true);
});

test('time control and result together both have to hold', () => {
  expect(ids({ speed: 'blitz', result: 'loss' })).toEqual(['b']);
  expect(ids({ speed: 'bullet', result: 'loss' })).toEqual([]);
});
