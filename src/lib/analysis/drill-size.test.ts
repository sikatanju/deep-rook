import { expect, test } from 'vitest';

import { loadSize, saveSize, take } from './drill-size';

const queue = [1, 2, 3, 4, 5, 6, 7];

test('a capped session takes the top of the queue in its order', () => {
  expect(take(queue, 5)).toEqual([1, 2, 3, 4, 5]);
});

test('a queue shorter than the cap, or all, is taken whole', () => {
  expect(take([1, 2], 5)).toEqual([1, 2]);
  expect(take(queue, 'all')).toEqual(queue);
});

test('the size is remembered, and anything else reads as all', () => {
  expect(loadSize()).toBe('all');
  saveSize(10);
  expect(loadSize()).toBe(10);
  localStorage.setItem('drillSize', '7');
  expect(loadSize()).toBe('all');
  localStorage.setItem('drillSize', 'not json');
  expect(loadSize()).toBe('all');
});
