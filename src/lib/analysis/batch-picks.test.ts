import { expect, test } from 'vitest';

import type { Game } from '@/lib/chesscom/types';

import { isLoss, pickBatch } from './batch-picks';

function game(
  id: string,
  me: 'white' | 'black',
  outcome: 'win' | 'loss' | 'draw',
  name = 'Me',
): Game {
  const mine = {
    username: name,
    rating: 1500,
    result:
      outcome === 'win' ? 'win' : outcome === 'loss' ? 'resigned' : 'agreed',
  };
  const theirs = {
    username: 'Rival',
    rating: 1500,
    result:
      outcome === 'loss' ? 'win' : outcome === 'win' ? 'resigned' : 'agreed',
  };
  return {
    id,
    site: 'chesscom',
    url: `https://example.test/${id}`,
    pgn: '1. e4 e5 *',
    endedAt: new Date(2026, 0, 1),
    timeControl: '180',
    timeClass: 'blitz',
    rated: true,
    white: me === 'white' ? mine : theirs,
    black: me === 'black' ? mine : theirs,
  };
}

test("a loss is judged from the side whose name is the player's", () => {
  expect(isLoss(game('a', 'white', 'loss'), ['me'])).toBe(true);
  expect(isLoss(game('b', 'black', 'loss'), [' ME '])).toBe(true);
  expect(isLoss(game('c', 'black', 'win'), ['me'])).toBe(false);
  expect(isLoss(game('d', 'white', 'draw'), ['me'])).toBe(false);
  expect(isLoss(game('e', 'white', 'loss', 'Alt'), ['me', 'alt'])).toBe(true);
});

test("a game with none of the player's names is nobody's loss", () => {
  expect(isLoss(game('a', 'white', 'loss'), ['someone'])).toBe(false);
  expect(isLoss(game('b', 'white', 'loss'), [])).toBe(false);
});

const listed = [
  game('1', 'white', 'win'),
  game('2', 'black', 'loss'),
  game('3', 'white', 'draw'),
  game('4', 'white', 'loss'),
  game('5', 'black', 'win'),
  game('6', 'white', 'loss'),
];
const ids = (games: readonly Game[]) => games.map((g) => g.id);

test('without the filter the latest N listed games are taken', () => {
  const { games, losses } = pickBatch(listed, 3, false, ['me']);
  expect(ids(games)).toEqual(['1', '2', '3']);
  expect(losses).toBeNull();
});

test('losses only takes the latest N losses, newest first, skipping wins', () => {
  const { games, losses } = pickBatch(listed, 2, true, ['me']);
  expect(ids(games)).toEqual(['2', '4']);
  expect(losses).toBe(2);
});

test('draws are not losses', () => {
  const drawn = [game('1', 'white', 'draw'), game('2', 'black', 'draw')];
  const { games, losses } = pickBatch(drawn, 5, true, ['me']);
  expect(games).toEqual([]);
  expect(losses).toBe(0);
});

test('with fewer losses than N, it takes them all and reports how many', () => {
  const { games, losses } = pickBatch(listed, 10, true, ['me']);
  expect(ids(games)).toEqual(['2', '4', '6']);
  expect(losses).toBe(3);
});
