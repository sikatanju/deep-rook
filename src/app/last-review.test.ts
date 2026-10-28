import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import {
  clearLastReview,
  loadLastReview,
  parseLastReview,
  saveLastReview,
} from './last-review';

const review = {
  replay: parseReplay(OPERA_GAME),
  source: 'Paul Morphy vs Duke Karl / Count Isouard',
  orientation: 'b' as const,
  level: 'deep' as const,
  index: 4,
};

test('a saved review reads back whole', () => {
  saveLastReview(review);
  expect(loadLastReview()).toEqual(review);
});

test('a review saved before ply was stored reopens at the start', () => {
  const older: Partial<typeof review> = { ...review };
  delete older.index;
  localStorage.setItem('lastReview', JSON.stringify({ v: 1, ...older }));
  expect(loadLastReview()).toEqual({ ...review, index: 0 });
});

test('an impossible ply reopens at the start', () => {
  saveLastReview({ ...review, index: 999 });
  expect(loadLastReview()?.index).toBe(0);
  saveLastReview({ ...review, index: 1.5 });
  expect(loadLastReview()?.index).toBe(0);
});

test('nothing saved is no review', () => {
  expect(loadLastReview()).toBeNull();
});

test('clearing removes the review a refresh would reopen', () => {
  saveLastReview(review);
  clearLastReview();
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
