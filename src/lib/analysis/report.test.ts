// Pins the report derivations the review UI reads: evalSeries (settled-only
// win% per position) and gameReport (per-color accuracy on the pinned curve,
// per-grade counts bagged by the mover, and the five worst moments). Every
// accuracy and loss expectation below is a literal constant with its
// derivation in a comment — the curve is
//   accuracy(loss) = clamp(103.1668·exp(−0.04354·loss) − 3.1669, 0, 100)
// meaned per color, with loss on the win% scale pinned by score.ts.

import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import type { Score } from '@/lib/chess/score';

import { CLASSIFICATIONS, classifyMoves, type Classification } from './classify';
import type { PositionAnalysis } from './game-analysis';
import { evalSeries, gameReport } from './report';

const replay = parseReplay(OPERA_GAME);
const cp = (n: number): Score => ({ kind: 'cp', cp: n });
const mate = (moves: number): Score => ({ kind: 'mate', winner: 'w', moves });

/** Opera-length positions: done with `lines[i]` where given, else queued. */
function positions(
  lines: Record<number, [Score, string[]]>,
  overrides: Record<number, PositionAnalysis> = {},
): PositionAnalysis[] {
  return Array.from(
    { length: replay.plies.length + 1 },
    (_, i): PositionAnalysis => {
      const over = overrides[i];
      if (over) return over;
      const line = lines[i];
      return line
        ? { status: 'done', line: { score: line[0], pv: line[1], depth: 10 } }
        : { status: 'queued', line: null };
    },
  );
}

/** The report of hand-built positions, graded the way the Viewer grades. */
function reportOf(lines: Record<number, [Score, string[]]>) {
  const pos = positions(lines);
  return gameReport(replay, pos, classifyMoves(replay, pos));
}

/**
 * A done pair around ply i: level before the move, `after` once it lands.
 * Pairs are used at least two plies apart, so no neighbor ply brackets two
 * done positions and only ply i itself grades.
 */
function swing(i: number, after: Score): Record<number, [Score, string[]]> {
  return {
    [i]: [cp(0), ['a2a3']],
    [i + 1]: [after, ['a2a3']],
  };
}

test('evalSeries settles only done positions', () => {
  const blackMates: Score = { kind: 'mate', winner: 'b', moves: 1 };
  const pos: PositionAnalysis[] = [
    { status: 'queued', line: null },
    { status: 'done', line: { score: cp(0), pv: ['a2a3'], depth: 10 } },
    { status: 'failed' },
    // A provisional line is not a settled evaluation.
    { status: 'searching', line: { score: cp(300), pv: ['a2a3'], depth: 5 } },
    { status: 'done', line: { score: mate(2), pv: ['a2a3'], depth: 10 } },
    { status: 'done', line: { score: blackMates, pv: [], depth: 10 } },
  ];
  expect(evalSeries(pos)).toEqual([null, 50, null, null, 100, 0]);
});

test('accuracy is the per-color mean of the pinned curve', () => {
  // 1.e4 (ply 0, White) turns a level game into -4: White's win chances
  // fall from 50 to winPercent(cp -400) = 18.6512, a loss of 31.3487
  // points, so the single graded ply is worth
  // 103.1668·exp(-0.04354·31.3487) - 3.1669 = 23.1819.
  const r = reportOf({ 0: [cp(0), ['d2d4']], 1: [cp(-400), ['a2a3']] });
  expect(r.white.accuracy).toBeCloseTo(23.18, 1);
  expect(r.white.gradedPlies).toBe(1);
  // 1...e5 (ply 1, Black) is bracketed by positions 1 and 2; 2 is queued.
  expect(r.black.accuracy).toBeNull();
  expect(r.black.gradedPlies).toBe(0);
});

test('a zero-loss ply is worth 99.9999 accuracy, not 100', () => {
  // exp(0) = 1, so every level-to-level ply scores 103.1668 - 3.1669
  // exactly, and so does the mean. Precision 6, because an implementation
  // that rounds to a tidy 100 must fail: the difference is 1e-4.
  const flat: Record<number, [Score, string[]]> = {};
  for (const i of [0, 1, 2, 3, 4, 5]) flat[i] = [cp(0), ['a2a3']];
  const r = reportOf(flat);
  expect(r.white.accuracy).toBeCloseTo(99.9999, 6);
  expect(r.white.gradedPlies).toBe(3);
  expect(r.black.gradedPlies).toBe(2);
});

test('counts bag per mover color, zeros included', () => {
  // 1...e5 (ply 1, Black) drops a level game to +4 for White: a Black
  // blunder, so it lands in black.counts while white.counts stays clean.
  // Positions 30-33 are the Opera brilliant fixture from classify.test.ts.
  const r = reportOf({
    1: [cp(0), ['a2a3']],
    2: [cp(400), ['a2a3']],
    30: [mate(2), ['b3b8', 'd7b8', 'd1d8']],
    31: [mate(1), ['d7b8', 'd1d8']],
    32: [mate(1), ['d1d8']],
    33: [mate(0), []],
  });
  expect(r.white.counts.brilliant).toBe(1);
  expect(r.white.counts.blunder).toBe(0);
  expect(r.black.counts.blunder).toBe(1);
  expect(r.black.counts.best).toBe(1);
  expect(r.black.counts.brilliant).toBe(0);
  // All nine grades are always present, zero or not.
  for (const grade of Object.keys(CLASSIFICATIONS) as Classification[]) {
    expect(r.white.counts[grade]).toBeTypeOf('number');
    expect(r.black.counts[grade]).toBeTypeOf('number');
  }
});

test('key moments rank by loss, break ties by earlier ply, cap at five', () => {
  // Six qualifying plies as isolated done pairs, so nothing else grades:
  //   ply 2   2.Nf3    cp 0 -> -150, loss 13.4672  mistake (tie, kept)
  //   ply 6   4.dxe5   cp 0 -> -150, loss 13.4672  mistake (tie, dropped)
  //   ply 10  6.Bc4    cp 0 -> -200, loss 17.6202  mistake
  //   ply 14  8.Nc3    cp 0 -> -200, loss 17.6202  mistake
  //   ply 20  11.Bxb5+ cp 0 -> -250, loss 21.5163  blunder
  //   ply 30  16.Qb8+  cp 0 -> -400, loss 31.3487  blunder (ranked first)
  // plus 13.Rxd7 (ply 24), graded excellent, which must never qualify.
  const pos = positions({
    ...swing(2, cp(-150)),
    ...swing(6, cp(-150)),
    ...swing(10, cp(-200)),
    ...swing(14, cp(-200)),
    ...swing(20, cp(-250)),
    ...swing(24, cp(0)),
    ...swing(30, cp(-400)),
  });
  const grades = classifyMoves(replay, pos);
  const r = gameReport(replay, pos, grades);

  expect(grades[24]).toBe('excellent'); // graded, yet never a key moment

  // Ranked by loss desc (ties by earlier ply), top five kept, then
  // displayed in game order: plies 2, 10, 14, 20, 30. Rank order is the
  // reverse here, so this pins the chronological display, not the ranking.
  expect(r.keyMoments.map((m) => m.index)).toEqual([3, 11, 15, 21, 31]);
  // The 13.4672 tie: ply 2 stays, ply 6 (index 7) is the one dropped.
  expect(r.keyMoments.some((m) => m.index === 7)).toBe(false);
  expect(
    r.keyMoments.every(
      (m) =>
        m.grade === 'mistake' || m.grade === 'miss' || m.grade === 'blunder',
    ),
  ).toBe(true);

  const first = r.keyMoments[0]!;
  expect(first.san).toBe('Nf3');
  expect(first.moveNumber).toBe(2);

  // The heaviest moment, pinned field by field: 16.Qb8+ lands the viewer
  // on the position after it.
  const last = r.keyMoments[4]!;
  expect(last).toMatchObject({
    index: 31,
    moveNumber: 16,
    san: 'Qb8+',
    color: 'w',
    grade: 'blunder',
  });
  expect(last.loss).toBeCloseTo(31.35, 1);
});

test('key moments of a game set up from a FEN carry its move numbers', () => {
  const fenGame = parseReplay(`[SetUp "1"]
[FEN "r2q1rk1/pppp1ppp/8/8/4P3/8/PPP2PPP/R2Q1RK1 b - - 0 20"]

20... d5 21. exd5 Qxd5 *`);
  // The eval swings by four pawns each ply, so every mover blunders.
  const pos: PositionAnalysis[] = [cp(0), cp(400), cp(0), cp(400)].map(
    (score) => ({ status: 'done', line: { score, pv: ['a2a3'], depth: 10 } }),
  );
  const r = gameReport(fenGame, pos, classifyMoves(fenGame, pos));
  expect(
    r.keyMoments.map(({ moveNumber, color, san }) => ({
      moveNumber,
      color,
      san,
    })),
  ).toEqual([
    { moveNumber: 20, color: 'b', san: 'd5' },
    { moveNumber: 21, color: 'w', san: 'exd5' },
    { moveNumber: 21, color: 'b', san: 'Qxd5' },
  ]);
});

test('unsettled plies never qualify or contribute', () => {
  // 16.Qb8+ would be a blunder, but position 31 is still searching.
  const pos = positions(
    { 30: [cp(0), ['a2a3']] },
    {
      31: {
        status: 'searching',
        line: { score: cp(-400), pv: ['a2a3'], depth: 5 },
      },
    },
  );
  expect(classifyMoves(replay, pos)[30]).toBeNull();

  // Even a hand-fed grade cannot sneak past the null series value: the
  // report itself must skip a ply whose after-neighbor is unsettled.
  const forged: (Classification | null)[] = Array.from(
    { length: replay.plies.length },
    () => null,
  );
  forged[30] = 'blunder';
  const r = gameReport(replay, pos, forged);
  expect(r.keyMoments).toEqual([]);
  expect(r.white.gradedPlies).toBe(0);
  expect(r.white.accuracy).toBeNull();
});

test('settled counts done and failed; total is plies + 1', () => {
  const pos = positions(
    { 0: [cp(0), ['a2a3']], 1: [cp(0), ['a2a3']] },
    { 2: { status: 'failed' } },
  );
  const r = gameReport(replay, pos, classifyMoves(replay, pos));
  expect(r.settled).toBe(3);
  expect(r.total).toBe(34);
});

test('an empty stream builds an all-zero report without throwing', () => {
  const r = reportOf({});
  expect(r.white.accuracy).toBeNull();
  expect(r.black.accuracy).toBeNull();
  expect(r.keyMoments).toEqual([]);
  for (const grade of Object.keys(CLASSIFICATIONS) as Classification[]) {
    expect(r.white.counts[grade]).toBe(0);
    expect(r.black.counts[grade]).toBe(0);
  }
  expect(r.settled).toBe(0);
});
