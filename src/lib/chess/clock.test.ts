import { expect, test } from 'vitest';

import {
  clockShowing,
  formatSpent,
  moveClocks,
  parseTimeControl,
  timeClassOf,
  troubleLine,
} from './clock';
import { parseReplay } from './replay';

const clocked = (control: string, moves: string) =>
  parseReplay(`[TimeControl "${control}"]\n\n${moves}`);

test('reads base and increment from the TimeControl header', () => {
  expect(parseTimeControl('180+2')).toEqual({ base: 180, increment: 2 });
  expect(parseTimeControl('600')).toEqual({ base: 600, increment: 0 });
  expect(parseTimeControl('1/86400')).toEqual({
    base: 86400,
    increment: 0,
    perMove: true,
  });
  for (const tag of ['-', '', '0+1', '40/7200', undefined])
    expect(parseTimeControl(tag)).toBeNull();
});

test('the trouble line is a tenth of the base, ten seconds at least', () => {
  expect(troubleLine({ base: 60, increment: 0 })).toBe(10);
  expect(troubleLine({ base: 600, increment: 5 })).toBe(60);
});

test('a move takes the time before it plus the increment, minus the time after', () => {
  // Lichess, 5+3, trimmed from a real game: no increment on each side's first move.
  const replay = clocked(
    '300+3',
    '1. d4 { [%clk 0:05:00] } 1... d5 { [%clk 0:05:00] } 2. c4 { [%clk 0:05:02] } 2... c5 { [%clk 0:05:01] } 3. Nc3 { [%clk 0:05:03] } 3... cxd4 { [%clk 0:04:47] } 4. Qxd4 { [%clk 0:05:04] } 4... Nf6 { [%clk 0:04:24] }',
  );
  expect(moveClocks(replay).map((c) => c?.spent)).toEqual([
    0, 0, 1, 2, 2, 17, 2, 26,
  ]);
  expect(moveClocks(replay)[5]).toEqual({
    spent: 17,
    before: 301,
    trouble: false,
  });
});

test('marks the moves begun under the trouble line', () => {
  const replay = clocked(
    '60+0',
    '1. e4 {[%clk 0:00:59.5]} e5 {[%clk 0:00:58]} 2. Nf3 {[%clk 0:00:09.5]} Nc6 {[%clk 0:00:50]} 3. Bb5 {[%clk 0:00:08.2]}',
  );
  const clocks = moveClocks(replay);
  expect(clocks.map((c) => c?.trouble)).toEqual([
    false,
    false,
    false,
    false,
    true,
  ]);
  expect(clocks[2]!.spent).toBe(50);
  expect(clocks[4]!.spent).toBeCloseTo(1.3);
});

test('a missing reading leaves that move and the side’s next one unknown', () => {
  const replay = clocked(
    '180+0',
    '1. e4 {[%clk 0:02:59]} e5 {[%clk 0:02:58]} 2. Nf3 Nc6 {[%clk 0:02:50]} 3. Bb5 {[%clk 0:02:40]} a6 {[%clk 0:02:45]}',
  );
  expect(moveClocks(replay).map((c) => c?.spent ?? null)).toEqual([
    1,
    2,
    null,
    8,
    null,
    5,
  ]);
});

test('no time control, no clocks', () => {
  const replay = parseReplay('1. e4 {[%clk 0:02:59]} e5 {[%clk 0:02:58]}');
  expect(moveClocks(replay)).toEqual([null, null]);
  expect(moveClocks(clocked('1/86400', '1. e4 e5'))).toEqual([null, null]);
});

test('a correspondence move spends a fresh day, and a gap does not blank the next', () => {
  const replay = clocked(
    '1/86400',
    '1. e4 {[%clk 23:00:00]} e5 {[%clk 22:00:00]} 2. Nf3 Nc6 {[%clk 23:30:00]}',
  );
  expect(moveClocks(replay)).toEqual([
    { spent: 3600, before: 86400, trouble: false },
    { spent: 7200, before: 86400, trouble: false },
    null,
    { spent: 1800, before: 86400, trouble: false },
  ]);
  expect(clockShowing(replay, 0, 'w')).toBe(86400);
  expect(clockShowing(replay, 1, 'w')).toBe(82800);
  expect(clockShowing(replay, 1, 'b')).toBe(86400);
  expect(clockShowing(replay, 2, 'w')).toBe(86400);
  expect(clockShowing(replay, 3, 'b')).toBe(86400);
});

test('formats time spent for prose', () => {
  expect(formatSpent(0.04)).toBe('0.0s');
  expect(formatSpent(4.26)).toBe('4.3s');
  expect(formatSpent(9.96)).toBe('10s');
  expect(formatSpent(42.4)).toBe('42s');
  expect(formatSpent(65)).toBe('1:05');
  expect(formatSpent(59.6)).toBe('1:00');
});

test('names the speed of a control by base plus 40 increments', () => {
  const speeds = ['60', '180', '300+3', '600', '900+10', '1800', '1/86400'].map(
    timeClassOf,
  );
  expect(speeds).toEqual([
    'bullet',
    'blitz',
    'blitz',
    'rapid',
    'rapid',
    'classical',
    'daily',
  ]);
  expect(timeClassOf('-')).toBeNull();
  expect(timeClassOf(undefined)).toBeNull();
});
