import { expect, test } from 'vitest';

import { clampBoardSize, parseBoardSize } from './board-size';

test('a saved size is kept when it is a width the handle could set', () => {
  expect(parseBoardSize(640)).toBe(640);
  expect(parseBoardSize(640.4)).toBe(640);
  for (const bad of [null, '640', NaN, Infinity, 10, 99_999, undefined])
    expect(parseBoardSize(bad)).toBeNull();
});

test('clamping stays inside the handle range', () => {
  expect(clampBoardSize(1)).toBe(280);
  expect(clampBoardSize(1e6)).toBe(2200);
  expect(clampBoardSize(500)).toBe(500);
});
