import { expect, test } from 'vitest';

import { ANALYSIS_LEVELS, LEVELS } from './levels';
import { plan, type PlanInput } from './schedule';

const input = (over: Partial<PlanInput>): PlanInput => ({
  level: 'deep',
  focus: 0,
  focusDwelled: false,
  settled: Array(6).fill(null),
  running: [null, null, null],
  ...over,
});

test('every level limit strictly increases in rank order', () => {
  for (const key of ['depth', 'nodes', 'maxMs'] as const) {
    const values = LEVELS.map((l) => ANALYSIS_LEVELS[l].limits[key]);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  }
});

test('focus goes first at the requested level, then first light nearest the focus', () => {
  expect(plan(input({ focus: 2 }))).toEqual([
    { kind: 'start', slot: 0, index: 2, level: 'deep' },
    { kind: 'start', slot: 1, index: 3, level: 'fast' },
    { kind: 'start', slot: 2, index: 1, level: 'fast' },
  ]);
});

test('upgrades follow once every position has a first result', () => {
  const settled = ['deep', 'fast', 'fast', 'fast', 'fast', 'fast'] as const;
  expect(plan(input({ settled, running: [null] }))).toEqual([
    { kind: 'start', slot: 0, index: 1, level: 'deep' },
  ]);
});

test('at the lowest level there is no separate first-light pass', () => {
  expect(plan(input({ level: 'fast', running: [null, null] }))).toEqual([
    { kind: 'start', slot: 0, index: 0, level: 'fast' },
    { kind: 'start', slot: 1, index: 1, level: 'fast' },
  ]);
});

test('a busy pool preempts slot 0 for the focus only after the dwell', () => {
  const busy = input({ focus: 4, running: [0, 1, 2] });
  expect(plan(busy)).toEqual([]);
  expect(plan({ ...busy, focusDwelled: true })).toEqual([
    { kind: 'preempt', slot: 0, index: 4, level: 'deep' },
  ]);
});

test('never duplicates a running position or redoes a settled one', () => {
  const settled = ['deep', null, 'deep', 'deep', 'deep', 'deep'] as const;
  expect(plan(input({ settled, running: [1, null, null] }))).toEqual([]);
});
