import { expect, test } from 'vitest';

import { soundFor } from './sound';

test('a ply sounds as check, capture, castle or a plain move, in that order', () => {
  expect(soundFor({ san: 'Nf3' })).toBe('move');
  expect(soundFor({ san: 'exd5' })).toBe('capture');
  expect(soundFor({ san: 'O-O-O' })).toBe('castle');
  expect(soundFor({ san: 'Qxf7+' })).toBe('check');
  expect(soundFor({ san: 'Qh5', check: true })).toBe('check');
  expect(soundFor({ san: 'Qxf7#' })).toBe('check');
});
