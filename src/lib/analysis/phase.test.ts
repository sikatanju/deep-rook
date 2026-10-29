import { expect, test } from 'vitest';

import type { PositionAnalysis } from './game-analysis';
import { analysisPhase, nextMistake, previousMistake } from './report';

const line = { score: { kind: 'cp', cp: 0 }, pv: [], depth: 4 } as const;
const done: PositionAnalysis = { status: 'done', line };
const blank: PositionAnalysis = { status: 'queued', line: null };
const provisional: PositionAnalysis = { status: 'queued', line };
const searching: PositionAnalysis = { status: 'searching', line };

const phase = (positions: PositionAnalysis[], index: number) =>
  analysisPhase(
    {
      positions,
      done: positions.filter((p) => p.status === 'done').length,
    },
    index,
  );

test('an unsettled viewed position is the focus, however the rest stands', () => {
  expect(phase([searching, blank, blank], 0)).toBe('focus');
  expect(phase([done, blank, provisional], 2)).toBe('focus');
});

test('once the viewed position is settled, blanks mean first light', () => {
  expect(phase([done, blank, provisional], 0)).toBe('first-light');
});

test('with every position lined but some below the level, it is upgrading', () => {
  expect(phase([done, provisional, searching], 0)).toBe('upgrade');
});

test('everything settled is done, and a failed position counts as settled', () => {
  expect(phase([done, done], 1)).toBe('done');
  expect(
    analysisPhase({ positions: [done, { status: 'failed' }], done: 2 }, 0),
  ).toBe('done');
  expect(phase([done, { status: 'failed' }, blank], 1)).toBe('first-light');
});

test('nextMistake finds the next inaccuracy, mistake, miss or blunder after the viewed position', () => {
  // grades[p] is the grade of ply p, which produces position p + 1.
  const grades = ['best', 'mistake', 'good', null, 'blunder', 'miss'] as const;
  expect(nextMistake(grades, 0)).toBe(2);
  expect(nextMistake(grades, 2)).toBe(5);
  expect(nextMistake(grades, 5)).toBe(6);
  expect(nextMistake(grades, 6)).toBeNull();
  expect(nextMistake([], 0)).toBeNull();
});

test('nextMistake stops on inaccuracies too, and previousMistake walks back', () => {
  const grades = [
    'best',
    'inaccuracy',
    'good',
    'blunder',
    'excellent',
  ] as const;
  expect(nextMistake(grades, 0)).toBe(2);
  expect(nextMistake(grades, 2)).toBe(4);
  expect(nextMistake(grades, 4)).toBeNull();
  expect(previousMistake(grades, 5)).toBe(4);
  // Standing on a mistake's position looks for the one before it.
  expect(previousMistake(grades, 4)).toBe(2);
  expect(previousMistake(grades, 2)).toBeNull();
  expect(previousMistake(grades, 0)).toBeNull();
  expect(previousMistake([], 3)).toBeNull();
});

test("nextMistake and previousMistake count only the chosen side's moves", () => {
  // Plies alternate White, Black, White, Black, White.
  const plies = ['w', 'b', 'w', 'b', 'w'].map((color) => ({
    color: color as 'w' | 'b',
  }));
  const grades = ['mistake', 'blunder', 'good', 'inaccuracy', 'miss'] as const;
  const white = { side: 'w', plies } as const;
  const black = { side: 'b', plies } as const;
  expect(nextMistake(grades, 0, white)).toBe(1);
  expect(nextMistake(grades, 1, white)).toBe(5);
  expect(nextMistake(grades, 0, black)).toBe(2);
  expect(nextMistake(grades, 2, black)).toBe(4);
  expect(nextMistake(grades, 4, black)).toBeNull();
  expect(previousMistake(grades, 5, black)).toBe(4);
  expect(previousMistake(grades, 4, white)).toBe(1);
  expect(previousMistake(grades, 4, black)).toBe(2);
  expect(previousMistake(grades, 1, white)).toBeNull();
});
