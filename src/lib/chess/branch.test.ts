import { describe, expect, test } from 'vitest';

import {
  branchFen,
  branchFens,
  isGameMove,
  playedPlies,
  playLine,
  playMove,
  stepTo,
} from './branch';
import { fenAt, OPERA_GAME, parseReplay } from './replay';

const replay = parseReplay(OPERA_GAME);
const sans = (b: { plies: readonly { san: string }[] } | null) =>
  b?.plies.map((p) => p.san);

describe('playMove', () => {
  test('opens a branch off the game position', () => {
    // Opera Game after 1. e4: Black plays c5 instead of e5.
    const branch = playMove(null, replay, 1, { from: 'c7', to: 'c5' });
    expect(sans(branch)).toEqual(['c5']);
    expect(branch).toMatchObject({ base: 1, at: 1 });
    expect(branch!.plies[0]).toMatchObject({
      color: 'b',
      moveNumber: 1,
      check: false,
    });
    expect(branchFen(replay, branch!)).toBe(branch!.plies[0]!.fen);
  });

  test('extends the line from the board', () => {
    const one = playMove(null, replay, 1, { from: 'c7', to: 'c5' });
    const two = playMove(one, replay, 1, { from: 'g1', to: 'f3' });
    expect(sans(two)).toEqual(['c5', 'Nf3']);
    expect(two!.at).toBe(2);
  });

  test('a move after stepping back replaces the rest of the line', () => {
    const line = playLine(null, replay, 1, ['c7c5', 'g1f3', 'd7d6']);
    const back = stepTo(line!, 1);
    const other = playMove(back, replay, 1, { from: 'b1', to: 'c3' });
    expect(sans(other)).toEqual(['c5', 'Nc3']);
  });

  test('repeating the next move of the line steps forward and keeps the rest', () => {
    const line = playLine(null, replay, 1, ['c7c5', 'g1f3', 'd7d6']);
    const back = stepTo(line!, 1);
    const again = playMove(back, replay, 1, { from: 'g1', to: 'f3' });
    expect(again).toMatchObject({ at: 2 });
    expect(sans(again)).toEqual(['c5', 'Nf3', 'd6']);
  });

  test('an illegal move is null', () => {
    expect(playMove(null, replay, 0, { from: 'e2', to: 'e5' })).toBeNull();
  });

  test('a promotion needs its piece', () => {
    const promo = parseReplay(
      '[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=Q Kg6',
    );
    expect(playMove(null, promo, 0, { from: 'a7', to: 'a8' })).toBeNull();
    const queen = playMove(null, promo, 0, {
      from: 'a7',
      to: 'a8',
      promotion: 'q',
    });
    expect(sans(queen)).toEqual(['a8=Q']);
  });

  test('records a check', () => {
    const line = playLine(null, replay, 0, ['e2e4', 'f7f6', 'd1h5']);
    expect(line!.plies[2]).toMatchObject({ san: 'Qh5+', check: true });
  });
});

describe('playLine', () => {
  test('plays engine moves in order', () => {
    const line = playLine(null, replay, 0, ['e2e4', 'e7e5', 'g1f3']);
    expect(sans(line)).toEqual(['e4', 'e5', 'Nf3']);
    expect(line!.at).toBe(3);
  });

  test('stops before a move that does not apply', () => {
    const line = playLine(null, replay, 0, ['e2e4', 'e7e5', 'e2e4', 'a7a6']);
    expect(sans(line)).toEqual(['e4', 'e5']);
  });

  test('is null when its first move does not apply', () => {
    expect(playLine(null, replay, 0, ['e2e5'])).toBeNull();
  });
});

describe('the board and its path', () => {
  const line = playLine(null, replay, 2, ['g1f3', 'b8c6'])!;

  test('stepTo moves the board along the line and clamps', () => {
    expect(stepTo(line, 0).at).toBe(0);
    expect(branchFen(replay, stepTo(line, 0))).toBe(fenAt(replay, 2));
    expect(stepTo(line, 99).at).toBe(2);
    expect(stepTo(line, -3).at).toBe(0);
    expect(playedPlies(stepTo(line, 1)).map((p) => p.san)).toEqual(['Nf3']);
  });

  test('branchFens runs from the start through the board', () => {
    const fens = branchFens(replay, line);
    expect(fens).toHaveLength(2 + 1 + 2);
    expect(fens[2]).toBe(fenAt(replay, 2));
    expect(fens.at(-1)).toBe(line.plies[1]!.fen);
    expect(branchFens(replay, stepTo(line, 0))).toHaveLength(3);
  });
});

describe('isGameMove', () => {
  test('is true only for the move the game played next', () => {
    expect(isGameMove(replay, 0, { from: 'e2', to: 'e4' })).toBe(true);
    expect(isGameMove(replay, 0, { from: 'd2', to: 'd4' })).toBe(false);
    expect(
      isGameMove(replay, replay.plies.length, { from: 'a2', to: 'a3' }),
    ).toBe(false);
  });
});
