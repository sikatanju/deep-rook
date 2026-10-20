import { expect, test } from 'vitest';

import { formatScore } from './score';

test('evals read with one decimal and a sign, mates as M and the mover', () => {
  expect(formatScore({ kind: 'cp', cp: 140 })).toBe('+1.4');
  expect(formatScore({ kind: 'cp', cp: -60 })).toBe('-0.6');
  expect(formatScore({ kind: 'cp', cp: 0 })).toBe('0.0');
  expect(formatScore({ kind: 'cp', cp: 4 })).toBe('0.0');
  expect(formatScore({ kind: 'cp', cp: -4 })).toBe('0.0');
  expect(formatScore({ kind: 'mate', winner: 'w', moves: 2 })).toBe('M2');
  expect(formatScore({ kind: 'mate', winner: 'b', moves: 3 })).toBe('-M3');
  expect(formatScore({ kind: 'mate', winner: 'b', moves: 0 })).toBe('#');
});
