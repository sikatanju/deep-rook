import { expect, test } from 'vitest';

import { drillsOf } from './drill';
import { hintOf, hintsIn, themeOf } from './drill-hint';
import { cpLine, OPERA_SLIPS, stored } from './fixtures';

const BLACK = 'Duke Karl / Count Isouard';
const white = (cp: number, pv: string[]) => cpLine(cp, 12, pv);

test('a forced mate is a mate in so many', () => {
  const line = {
    score: { kind: 'mate', winner: 'w', moves: 2 },
    pv: ['d1d8'],
  } as const;
  expect(themeOf('3rk3/8/8/8/8/8/8/3QK3 w - - 0 1', line, 'w')).toBe(
    'There is mate in 2.',
  );
});

test("the other side's mate is not a theme for you", () => {
  const line = {
    score: { kind: 'mate', winner: 'b', moves: 2 },
    pv: ['e1e2'],
  } as const;
  expect(themeOf('4k3/8/8/8/8/8/8/4K3 w - - 0 1', line, 'w')).toBeNull();
});

test('a knight that lands on two bigger pieces is a fork', () => {
  // Nc7+ forks the king on e8 and the rook on a8.
  expect(
    themeOf('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', white(0, ['d5c7']), 'w'),
  ).toBe('Look for a fork.');
  // From b6 the same knight reaches only the rook.
  expect(
    themeOf('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', white(0, ['d5b6']), 'w'),
  ).toBeNull();
});

test('a line that wins a piece is material to win', () => {
  // Bxe5 takes a loose knight; a quiet bishop move wins nothing.
  expect(
    themeOf('4k3/8/8/4n3/8/2B5/8/4K3 w - - 0 1', white(0, ['c3d4']), 'w'),
  ).toBeNull();
  expect(
    themeOf('4k3/8/8/4n3/8/2B5/8/4K3 w - - 0 1', white(0, ['c3e5']), 'w'),
  ).toBe('There is material to win.');
});

test('an even trade shows no theme', () => {
  const [first] = drillsOf(stored(OPERA_SLIPS), [BLACK]);
  // 4...dxe5 5.Qxd8+ Kxd8 wins a pawn and trades queens.
  expect(hintOf(first!)).toEqual({ from: 'd6', theme: null });
  expect(hintsIn(hintOf(first!))).toBe(1);
});

test('the first hint is the square the engine moves from', () => {
  const drills = drillsOf(stored(OPERA_SLIPS), [BLACK]);
  expect(drills.map((d) => hintOf(d).from)).toEqual(['d6', 'b8']);
});

test('a theme makes it two hints', () => {
  expect(hintsIn({ from: 'a1', theme: 'Look for a fork.' })).toBe(2);
});
