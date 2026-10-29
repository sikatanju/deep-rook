import { expect, test } from 'vitest';

import type { GameAnalysis, PositionAnalysis } from './game-analysis';
import { formatRemaining, progressOf, remainingMs } from './progress';
import { cpLine } from './fixtures';

const line = cpLine(0);
const done: PositionAnalysis = { status: 'done', line };
const blank: PositionAnalysis = { status: 'queued', line: null };
const rough: PositionAnalysis = { status: 'queued', line };

const doc = (
  level: GameAnalysis['level'],
  ...positions: PositionAnalysis[]
) => ({ level, positions });

test('at the lowest level one pass counts the settled positions', () => {
  expect(progressOf(doc('fast', done, done, blank, blank))).toEqual({
    pass: 'Analyzing',
    done: 2,
    total: 4,
    taken: 2,
    steps: 4,
  });
});

test('above it a first look counts the positions that have a line', () => {
  expect(progressOf(doc('balanced', rough, rough, blank, blank))).toEqual({
    pass: 'First look',
    done: 2,
    total: 4,
    taken: 2,
    steps: 8,
  });
});

test('once every position has a line the deepening counts the settled ones', () => {
  expect(progressOf(doc('balanced', done, rough, rough, rough))).toEqual({
    pass: 'Deepening',
    done: 1,
    total: 4,
    taken: 5,
    steps: 8,
  });
});

test('a position settled early counts in both passes', () => {
  expect(progressOf(doc('balanced', done, blank, blank, blank))).toMatchObject({
    pass: 'First look',
    done: 1,
    taken: 2,
  });
});

test('the bar only moves forward from the first look through the deepening', () => {
  const steps: PositionAnalysis[][] = [
    [blank, blank, blank],
    [rough, blank, blank],
    [done, blank, blank],
    [done, rough, rough],
    [done, done, rough],
    [done, done, { status: 'failed' }],
  ];
  const taken = steps
    .slice(0, -1)
    .map((positions) => progressOf(doc('deep', ...positions))!.taken);
  expect(taken).toEqual([0, 1, 2, 4, 5]);
});

test('nothing is in progress once every position has settled', () => {
  expect(progressOf(doc('balanced', done, { status: 'failed' }))).toBeNull();
});

test('no estimate until a few steps have passed, then the observed rate', () => {
  const first = { at: 0, taken: 2 };
  expect(remainingMs(first, { at: 4000, taken: 4 }, 20)).toBeNull();
  // 3 steps in 3 s: 1 s a step, 15 left.
  expect(remainingMs(first, { at: 3000, taken: 5 }, 20)).toBe(15_000);
  expect(remainingMs(first, { at: 0, taken: 9 }, 20)).toBeNull();
});

test('a time left reads in the unit that suits it', () => {
  expect(formatRemaining(4000)).toBe('a few seconds');
  expect(formatRemaining(42_000)).toBe('40 s');
  expect(formatRemaining(200_000)).toBe('4 min');
});
