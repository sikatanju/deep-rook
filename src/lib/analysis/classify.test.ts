import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import type { Score } from '@/lib/chess/score';

import { classifyMoves } from './classify';
import type { PositionAnalysis } from './game-analysis';

const replay = parseReplay(OPERA_GAME);
const cp = (n: number): Score => ({ kind: 'cp', cp: n });
const mate = (moves: number): Score => ({ kind: 'mate', winner: 'w', moves });

function grade(lines: Record<number, [Score, string[]]>) {
  const positions = Array.from(
    { length: replay.plies.length + 1 },
    (_, i): PositionAnalysis => {
      const line = lines[i];
      return line
        ? { status: 'done', line: { score: line[0], pv: line[1], depth: 10 } }
        : { status: 'queued', line: null };
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
