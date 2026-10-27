import { describe, expect, test } from 'vitest';

import { fenAt } from '@/lib/chess/replay';

import { drillQueue, drillsOf, judge, judgeAfter } from './drill';
import { cpLine, OPERA_SLIPS, stored } from './fixtures';

const BLACK = 'Duke Karl / Count Isouard';

describe('drillsOf', () => {
  test('turns each of the user’s mistakes into a puzzle before the move', () => {
    const record = stored(OPERA_SLIPS);
    const drills = drillsOf(record, [BLACK]);
    expect(drills.map((d) => d.index)).toEqual([8, 14]);

    const [first] = drills;
    expect(first).toMatchObject({
      id: `${record.key}:8`,
      record,
      fen: fenAt(record.replay, 7),
      color: 'b',
      moveNumber: 4,
      best: { uci: 'd6e5', san: 'dxe5' },
      played: { uci: 'g4f3', san: 'Bxf3' },
      line: ['dxe5', 'Qxd8+', 'Kxd8'],
      grade: 'blunder',
      opponent: 'Paul Morphy',
    });
    expect(first!.loss).toBeCloseTo(31.35, 1);
    expect(drills[1]).toMatchObject({
      best: { uci: 'b8c6', san: 'Nc6' },
      played: { san: 'Qe7' },
      grade: 'mistake',
    });
  });

  test('a position with no line drops only the moves it brackets', () => {
    const record = stored(OPERA_SLIPS);
    record.lines[14] = null;
    expect(drillsOf(record, [BLACK]).map((d) => d.index)).toEqual([8]);
  });

  test('matches the username in any case', () => {
    expect(drillsOf(stored(OPERA_SLIPS), [BLACK.toUpperCase()])).toHaveLength(
      2,
    );
  });

  test('never drills the other side or a game with no known side', () => {
    const record = stored(OPERA_SLIPS);
    expect(drillsOf(record, ['Paul Morphy'])).toEqual([]);
    expect(drillsOf(record, ['someone else'])).toEqual([]);
    expect(drillsOf(record, [])).toEqual([]);
  });

  test('drops a mistake whose engine move is missing or illegal', () => {
    const illegal = stored({
      ...OPERA_SLIPS,
      pvs: { 7: ['d6e5'], 13: ['a2a3'] },
    });
    expect(drillsOf(illegal, [BLACK]).map((d) => d.index)).toEqual([8]);
    const missing = stored({ ...OPERA_SLIPS, pvs: { 7: [], 13: ['b8c6'] } });
    expect(drillsOf(missing, [BLACK]).map((d) => d.index)).toEqual([14]);
  });

  test('keeps the line to four plies', () => {
    const long = stored({
      ...OPERA_SLIPS,
      pvs: { 7: ['d6e5', 'd1d8', 'e8d8', 'f1c4', 'g8f6', 'b1c3'] },
    });
    expect(drillsOf(long, [BLACK])[0]!.line).toEqual([
      'dxe5',
      'Qxd8+',
      'Kxd8',
      'Bc4',
    ]);
  });
});

test('drillQueue puts the costliest first, then the newer game, then the earlier move', () => {
  // 4...Bxf3 0 to +2 (loss 17.6202), 7...Qe7 +2 to +9 (loss 28.8690).
  const lateCostly = stored({
    ...OPERA_SLIPS,
    cps: [...Array(8).fill(0), ...Array(6).fill(200), ...Array(20).fill(900)],
    analyzedAt: 1,
  });
  // Both slips go from level to +4: the same loss, 31.3487.
  const tied = stored({
    ...OPERA_SLIPS,
    cps: [
      ...Array(8).fill(0),
      ...Array(5).fill(400),
      0,
      ...Array(20).fill(400),
    ],
    analyzedAt: 2,
  });
  const queue = drillQueue([lateCostly, tied], [BLACK]);
  expect(queue.map((d) => [d.record.analyzedAt, d.index])).toEqual([
    [2, 8],
    [2, 14],
    [1, 14],
    [1, 8],
  ]);
});

describe('judge', () => {
  /** Black's 4... Bxf3 drill, whose saved line puts White's eval at 0. */
  function drillWithSecond(second?: { cp: number; pv: string[] }) {
    const record = stored(OPERA_SLIPS);
    if (second)
      record.lines[7] = {
        ...record.lines[7]!,
        second: { score: { kind: 'cp', cp: second.cp }, pv: second.pv },
      };
    return drillsOf(record, [BLACK])[0]!;
  }
  const dxe5 = { from: 'd6', to: 'e5' } as const;

  test('knows the engine’s move and the one played', () => {
    const drill = drillWithSecond();
    expect(judge(drill, dxe5)).toBe('best');
    expect(judge(drill, { from: 'g4', to: 'f3' })).toBe('played');
  });

  test('any other move needs a search when there is no second line', () => {
    expect(judge(drillWithSecond(), { from: 'g8', to: 'f6' })).toBeNull();
  });

  test('a second line within 5 points is close, and others still need a search', () => {
    // +0.3 for White leaves Black 2.76 points short of the engine's 0.0.
    const drill = drillWithSecond({ cp: 30, pv: ['b8d7'] });
    expect(judge(drill, { from: 'b8', to: 'd7' })).toBe('close');
    expect(judge(drill, { from: 'g8', to: 'f6' })).toBeNull();
  });

  test('a second line that falls short rules out every other move', () => {
    const drill = drillWithSecond({ cp: 200, pv: ['b8d7'] });
    expect(judge(drill, { from: 'b8', to: 'd7' })).toBe('other');
    expect(judge(drill, { from: 'g8', to: 'f6' })).toBe('other');
  });

  test('judgeAfter grades a searched move by the points it gives up', () => {
    const drill = drillWithSecond();
    const close = judgeAfter(drill, cpLine(30));
    expect(close.verdict).toBe('close');
    expect(close.loss).toBeCloseTo(2.76, 2);
    const short = judgeAfter(drill, cpLine(200));
    expect(short.verdict).toBe('other');
    expect(short.loss).toBeCloseTo(17.62, 2);
    // Better for Black than the saved line: nothing lost.
    expect(judgeAfter(drill, cpLine(-50))).toEqual({
      verdict: 'close',
      loss: 0,
    });
  });
});
