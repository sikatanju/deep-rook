import { describe, expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import type { Score, Variation } from '@/lib/chess/score';

import { classifyMoves, gradeSideMove } from './classify';
import type { PositionAnalysis } from './game-analysis';

const replay = parseReplay(OPERA_GAME);
const cp = (n: number): Score => ({ kind: 'cp', cp: n });
const mate = (moves: number): Score => ({ kind: 'mate', winner: 'w', moves });

/** Each entry is [score, pv] or [score, pv, the engine's second line]. */
function grade(lines: Record<number, [Score, string[], Variation?]>) {
  const positions = Array.from(
    { length: replay.plies.length + 1 },
    (_, i): PositionAnalysis => {
      const line = lines[i];
      if (!line) return { status: 'queued', line: null };
      const [score, pv, second] = line;
      return {
        status: 'done',
        line: { score, pv, depth: 10, ...(second && { second }) },
      };
    },
  );
  return classifyMoves(replay, positions);
}

test('unsettled moves have no grade', () => {
  expect(grade({ 0: [cp(20), ['e2e4']] })[0]).toBeNull();
});

test.each([
  [-10, 'excellent'],
  [-50, 'good'],
  [-100, 'inaccuracy'],
  [-200, 'mistake'],
  [-400, 'blunder'],
])('1.e4 losing to %icp is %s', (after, kind) => {
  expect(grade({ 0: [cp(0), ['d2d4']], 1: [cp(after), ['e7e5']] })[0]).toBe(
    kind,
  );
});

test("grades from the mover's side", () => {
  expect(grade({ 1: [cp(0), ['c7c5']], 2: [cp(400), ['g1f3']] })[1]).toBe(
    'blunder',
  );
});

test('the engine move is best, and great when it punishes a mistake', () => {
  expect(grade({ 0: [cp(0), ['e2e4']], 1: [cp(0), ['e7e5']] })[0]).toBe('best');
  const punished = grade({
    0: [cp(0), ['d2d4']],
    1: [cp(-400), ['e7e5']],
    2: [cp(-400), ['g1f3']],
  });
  expect(punished[1]).toBe('great');
});

test('the engine move is great when the next best trails by 15 points of win chance', () => {
  // +0.0 against -2.0 is about 17.6 points for White; -1.0 is about 9.1.
  const only = grade({
    0: [cp(0), ['e2e4'], { score: cp(-200), pv: ['d2d4'] }],
    1: [cp(0), ['e7e5']],
  });
  expect(only[0]).toBe('great');
  const roomy = grade({
    0: [cp(0), ['e2e4'], { score: cp(-100), pv: ['d2d4'] }],
    1: [cp(0), ['e7e5']],
  });
  expect(roomy[0]).toBe('best');
});

test("the only-move gap is measured from the mover's side", () => {
  // Black to move: a second line at +2.0 is bad for Black, -2.0 is good.
  const black = (second: number) =>
    grade({
      1: [cp(0), ['e7e5'], { score: cp(second), pv: ['c7c5'] }],
      2: [cp(0), ['g1f3']],
    })[1];
  expect(black(200)).toBe('great');
  expect(black(-200)).toBe('best');
});

test('an only-move that was not played grades by the loss as usual', () => {
  const graded = grade({
    0: [cp(0), ['d2d4'], { score: cp(-300), pv: ['c2c4'] }],
    1: [cp(-200), ['e7e5']],
  });
  expect(graded[0]).toBe('mistake');
});

test('a mating line stays best however far behind the next best is', () => {
  const graded = grade({
    32: [mate(1), ['d1d8'], { score: cp(-1000), pv: ['d1d5'] }],
    33: [mate(0), []],
  });
  expect(graded[32]).toBe('best');
});

test('a plain recapture stays best however far behind the next best is', () => {
  // 4...Bxf3 5.Qxf3: White retakes on the square Black just captured on.
  expect(replay.plies[8]!.san).toBe('Qxf3');
  const graded = grade({
    8: [cp(0), ['d1f3'], { score: cp(-200), pv: ['g1f3'] }],
    9: [cp(0), ['d6e5']],
  });
  expect(graded[8]).toBe('best');
});

test('failing to punish a mistake is a miss', () => {
  const missed = grade({
    0: [cp(0), ['d2d4']],
    1: [cp(-400), ['c7c5']],
    2: [cp(-200), ['g1f3']],
  });
  expect(missed[1]).toBe('miss');
});

test('Qb8+ in the Opera Game is brilliant and Rd8# is best', () => {
  const graded = grade({
    30: [mate(2), ['b3b8', 'd7b8', 'd1d8']],
    31: [mate(1), ['d7b8', 'd1d8']],
    32: [mate(1), ['d1d8']],
    33: [mate(0), []],
  });
  expect(graded[30]).toBe('brilliant');
  expect(graded[32]).toBe('best');
});

describe('gradeSideMove', () => {
  const replay = parseReplay(OPERA_GAME);
  const white = replay.plies[0]!; // 1. e4
  const black = replay.plies[1]!; // 1... e5
  const cp = (n: number, pv: string[] = ['e2e4']) => ({
    score: { kind: 'cp', cp: n } as const,
    pv,
    depth: 10,
  });

  test("the engine's own move is best", () => {
    expect(gradeSideMove(white, cp(30), cp(30))).toBe('best');
  });

  test("grades the rest by the mover's loss, from either side", () => {
    expect(gradeSideMove(white, cp(0, ['d2d4']), cp(-20))).toBe('excellent');
    expect(gradeSideMove(white, cp(0, ['d2d4']), cp(-80))).toBe('inaccuracy');
    expect(gradeSideMove(white, cp(0, ['d2d4']), cp(-900))).toBe('blunder');
    // Black loses ground when the White-point-of-view score rises.
    expect(gradeSideMove(black, cp(0, ['d7d5']), cp(900))).toBe('blunder');
    expect(gradeSideMove(black, cp(0, ['d7d5']), cp(-900))).toBe('excellent');
  });

  test('has no great, brilliant or miss: those need the game around the move', () => {
    const grades = [30, -30, -150, -400, -900].map((after) =>
      gradeSideMove(white, cp(0, ['d2d4']), cp(after)),
    );
    expect(grades).not.toContain('great');
    expect(grades).not.toContain('brilliant');
    expect(grades).not.toContain('miss');
  });
});
