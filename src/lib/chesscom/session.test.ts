import { expect, test } from 'vitest';

import { groupByDay, losingStreak, outcomeFor } from './session';
import type { Game } from './types';

function game(
  id: string,
  endedAt: Date,
  me: 'win' | 'resigned' | 'agreed',
  rival: 'win' | 'resigned' | 'agreed',
): Game {
  return {
    id,
    site: 'chesscom',
    url: `https://www.chess.com/game/live/${id}`,
    pgn: '',
    endedAt,
    timeControl: '60',
    timeClass: 'bullet',
    rated: true,
    white: { username: 'Me', rating: 1500, result: me },
    black: { username: 'Rival', rating: 1490, result: rival },
  };
}

const at = (day: number, hour: number) => new Date(2025, 0, day, hour);

test('outcomeFor reads the result from the player’s side, either colour', () => {
  const won = game('1', at(4, 9), 'win', 'resigned');
  expect(outcomeFor(won, 'me').outcome).toBe('win');
  expect(outcomeFor(won, 'RIVAL')).toMatchObject({
    outcome: 'loss',
    white: false,
    opponent: { username: 'Me' },
  });
  expect(
    outcomeFor(game('2', at(4, 9), 'agreed', 'agreed'), 'Me').outcome,
  ).toBe('draw');
});

test('groupByDay splits on the local calendar day and keeps the order given', () => {
  const games = [
    game('a', at(5, 23), 'win', 'resigned'),
    game('b', at(5, 0), 'win', 'resigned'),
    game('c', at(4, 22), 'win', 'resigned'),
  ];
  const groups = groupByDay(games);
  expect(groups.map((g) => [g.key, g.games.map((x) => x.id)])).toEqual([
    ['2025-01-05', ['a', 'b']],
    ['2025-01-04', ['c']],
  ]);
  expect(groupByDay([])).toEqual([]);
});

test('a losing streak counts straight losses at the end of the latest day', () => {
  const lost = (id: string, h: number) => game(id, at(5, h), 'resigned', 'win');
  const won = (id: string, h: number) => game(id, at(5, h), 'win', 'resigned');
  const newestFirst = [lost('5', 19), lost('4', 18), lost('3', 17)];

  expect(losingStreak([...newestFirst, won('2', 16)], 'Me')).toMatchObject({
    count: 3,
    last: { id: '5' },
  });
  // A win in the middle ends the run.
  expect(losingStreak([lost('4', 18), won('3', 17), lost('2', 16)], 'Me')).toBe(
    null,
  );
  // Two is not a streak, and yesterday's losses do not count.
  expect(losingStreak([lost('4', 18), lost('3', 17)], 'Me')).toBe(null);
  expect(
    losingStreak(
      [
        won('9', 20),
        game('1', at(4, 9), 'resigned', 'win'),
        game('0', at(4, 8), 'resigned', 'win'),
        game('z', at(4, 7), 'resigned', 'win'),
      ],
      'Me',
    ),
  ).toBe(null);
  expect(losingStreak([], 'Me')).toBe(null);
});
