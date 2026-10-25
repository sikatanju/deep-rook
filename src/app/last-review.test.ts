import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import { loadLastReview, parseLastReview, saveLastReview } from './last-review';

const review = {
  replay: parseReplay(OPERA_GAME),
  source: 'Paul Morphy vs Duke Karl / Count Isouard',
  orientation: 'b' as const,
  level: 'deep' as const,
};

test('a saved review reads back whole', () => {
  saveLastReview(review);
  expect(loadLastReview()).toEqual(review);
});

test('nothing saved is no review', () => {
  expect(loadLastReview()).toBeNull();
});

test.each([
  ['not JSON', '{oops'],
  ['null', 'null'],
  ['a number', '3'],
  ['a wrong version', JSON.stringify({ v: 0, ...review })],
  ['an unknown level', JSON.stringify({ v: 1, ...review, level: 'insane' })],
  ['a bad side', JSON.stringify({ v: 1, ...review, orientation: 'x' })],
  ['no replay', JSON.stringify({ v: 1, ...review, replay: undefined })],
  [
    'a game with no moves',
    JSON.stringify({
      v: 1,
      ...review,
      replay: { ...review.replay, plies: [] },
    }),
  ],
  [
    'a damaged move',
    JSON.stringify({
      v: 1,
      ...review,
      replay: { ...review.replay, plies: [{ san: 'e4' }] },
    }),
  ],
])('%s is no review', (_, raw) => {
  expect(parseLastReview(raw)).toBeNull();
});
