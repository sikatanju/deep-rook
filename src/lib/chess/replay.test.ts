import { expect, test } from 'vitest';

import {
  OPERA_GAME,
  fenAt,
  formatClock,
  materialOf,
  openingName,
  parseReplay,
} from './replay';

test('parses the Opera Game into 33 plies ending in mate', () => {
  const r = parseReplay(OPERA_GAME);
  expect(r.plies).toHaveLength(33);
  expect(r.headers.White).toBe('Paul Morphy');
  expect(r.plies.at(-1)).toMatchObject({ san: 'Rd8#', check: true });
  expect(fenAt(r, 0)).toBe(r.start);
  expect(fenAt(r, 1)).toBe(r.plies[0]!.fen);
});

test('reads Chess.com clock comments', () => {
  const r = parseReplay(
    '1. e4 {[%clk 0:02:59.9]} 1... e5 {[%clk 0:02:58.1]} 2. Nf3 {[%clk 0:02:50]}',
  );
  expect(r.plies.map((p) => p.clock)).toEqual([179.9, 178.1, 170]);
});

test('rejects garbage and empty games', () => {
  expect(() => parseReplay('1. e4 e4')).toThrow();
  expect(() => parseReplay('[Event "x"]')).toThrow('no moves');
});

test('counts material after captures', () => {
  const r = parseReplay('1. e4 d5 2. exd5');
  const m = materialOf(fenAt(r, 3));
  expect(m.lost.b).toEqual(['p']);
  expect(m.lost.w).toEqual([]);
  expect(m.balance).toBe(1);
});

test('derives the opening and formats clocks', () => {
  expect(
    openingName({
      ECOUrl: 'https://www.chess.com/openings/Sicilian-Defense-2.Nf3-d6',
    }),
  ).toBe('Sicilian Defense');
  expect(openingName({})).toBeNull();
  expect(openingName({ Opening: 'Sicilian Defense: Najdorf Variation' })).toBe(
    'Sicilian Defense: Najdorf Variation',
  );
  expect(
    openingName({
      ECOUrl: 'https://www.chess.com/openings/Sicilian-Defense',
      Opening: 'Something else',
    }),
  ).toBe('Sicilian Defense');
  expect(openingName({ Opening: ' ' })).toBeNull();
  expect(formatClock(179.9)).toBe('2:59');
  expect(formatClock(3725)).toBe('1:02:05');
  expect(formatClock(9.4)).toBe('0:09.4');
});
