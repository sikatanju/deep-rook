import { describe, expect, test } from 'vitest';

import {
  moveFromSan,
  needsPromotion,
  ownsSquare,
  targetsFrom,
  uciOf,
} from './play';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('ownsSquare is true only for a piece of the side to move', () => {
  expect(ownsSquare(START, 'e2')).toBe(true);
  expect(ownsSquare(START, 'e7')).toBe(false);
  expect(ownsSquare(START, 'e4')).toBe(false);
  expect(ownsSquare('not a fen', 'e2')).toBe(false);
});

describe('targetsFrom', () => {
  test('a pinned piece moves only along the pin', () => {
    const pinned = '4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1';
    expect(targetsFrom(pinned, 'e2')).toEqual([]);
    const rook = '4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1';
    expect(targetsFrom(rook, 'e2').sort()).toEqual([
      'e3',
      'e4',
      'e5',
      'e6',
      'e7',
    ]);
  });

  test('the king lists its castling squares', () => {
    const fen = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    expect(targetsFrom(fen, 'e1')).toEqual(
      expect.arrayContaining(['g1', 'c1']),
    );
  });

  test('en passant is a target', () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
    expect(targetsFrom(fen, 'e5').sort()).toEqual(['d6', 'e6']);
  });

  test('a promoting pawn lists its square once', () => {
    expect(targetsFrom('7k/P7/8/8/8/8/8/7K w - - 0 1', 'a7')).toEqual(['a8']);
  });

  test('an empty square or a bad FEN has none', () => {
    expect(targetsFrom(START, 'e4')).toEqual([]);
    expect(targetsFrom('not a fen', 'e2')).toEqual([]);
  });
});

test('needsPromotion is true only for a pawn reaching the last rank', () => {
  const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1';
  expect(needsPromotion(fen, 'a7', 'a8')).toBe(true);
  expect(needsPromotion(fen, 'h1', 'h2')).toBe(false);
  expect(needsPromotion(START, 'e2', 'e4')).toBe(false);
});

describe('moveFromSan', () => {
  test('reads SAN with or without check marks', () => {
    const fen = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
    expect(moveFromSan(fen, 'Rh8+')).toMatchObject({ from: 'h1', to: 'h8' });
    expect(moveFromSan(fen, 'Rh8')).toMatchObject({ from: 'h1', to: 'h8' });
    expect(moveFromSan(fen, ' Rh8+! ')).toMatchObject({ from: 'h1', to: 'h8' });
  });

  test('reads a pawn capture by its lowercase file letter', () => {
    const fen = '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1';
    expect(moveFromSan(fen, 'exd5')).toMatchObject({ from: 'e4', to: 'd5' });
  });

  test('a lowercase b is the pawn when a pawn move reads, else the bishop', () => {
    const fen = '4k3/8/8/8/8/2n5/1P1B4/4K3 w - - 0 1';
    expect(moveFromSan(fen, 'bxc3')).toMatchObject({ from: 'b2', to: 'c3' });
    expect(moveFromSan(fen, 'Bxc3')).toMatchObject({ from: 'd2', to: 'c3' });
    expect(moveFromSan(fen, 'be3')).toMatchObject({ from: 'd2', to: 'e3' });
    expect(moveFromSan(START, 'nf3')).toMatchObject({ from: 'g1', to: 'f3' });
  });

  test('reads promotion and castling, zeros included', () => {
    expect(moveFromSan('7k/P7/8/8/8/8/8/7K w - - 0 1', 'a8=N')).toEqual({
      from: 'a7',
      to: 'a8',
      promotion: 'n',
    });
    const castle = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    expect(moveFromSan(castle, 'O-O')).toMatchObject({ from: 'e1', to: 'g1' });
    expect(moveFromSan(castle, '0-0-0')).toMatchObject({
      from: 'e1',
      to: 'c1',
    });
  });

  test('is null for an illegal, ambiguous or empty move, and never throws', () => {
    const twoKnights = '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1';
    expect(moveFromSan(twoKnights, 'Nd2')).toBeNull();
    expect(moveFromSan(twoKnights, 'Nbd2')).toMatchObject({ from: 'b1' });
    expect(moveFromSan(START, 'Qh5')).toBeNull();
    expect(moveFromSan(START, 'hello')).toBeNull();
    expect(moveFromSan(START, '   ')).toBeNull();
    expect(moveFromSan('not a fen', 'e4')).toBeNull();
  });
});

test('uciOf writes long algebraic, promotion last', () => {
  expect(uciOf({ from: 'e2', to: 'e4' })).toBe('e2e4');
  expect(uciOf({ from: 'a7', to: 'a8', promotion: 'q' })).toBe('a7a8q');
});
