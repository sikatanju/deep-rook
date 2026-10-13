import { expect, test } from 'vitest';

import { movingPiece } from '@/components/board/board';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

// The review board's motion is derived, not stored: `movingPiece` answers "which
// piece is flying, and which way?" from the ply at `index` and the index the
// viewer came from. A null answer means the board snaps.

test('a single forward step flies the ply that produced the position', () => {
  const replay = parseReplay(OPERA_GAME);
  expect(movingPiece(replay, 1, 0)).toEqual({
    from: 'e2',
    to: 'e4',
    code: 'wP',
    direction: 'forward',
    key: 1,
  });
  // 7. dxe5 is a capture: identity comes from the from-square, which held White's
  // pawn, while the destination square held Black's.
  expect(movingPiece(replay, 7, 6)).toMatchObject({
    from: 'd4',
    to: 'e5',
    code: 'wP',
  });
  // 19. Nxb5: a white knight takes on b5.
  expect(movingPiece(replay, 19, 18)).toMatchObject({
    from: 'c3',
    to: 'b5',
    code: 'wN',
  });
  // 23. O-O-O: the king is the piece the ply names; the rook is a second mover.
  expect(movingPiece(replay, 23, 22)).toMatchObject({
    from: 'e1',
    to: 'c1',
    code: 'wK',
  });
  // Black's pieces are black.
  expect(movingPiece(replay, 2, 1)!.code).toBe('bP');
});

test('a single backward step flies the same ply the other way', () => {
  const replay = parseReplay(OPERA_GAME);
  // Stepping from index 3 back to 2 unplays ply 3 (2. Nf3): the knight flies
  // f3 -> g1, read from the position after the ply, where it stands on f3.
  expect(movingPiece(replay, 2, 3)).toEqual({
    from: 'f3',
    to: 'g1',
    code: 'wN',
    direction: 'back',
    key: 2,
  });
  // Stepping from index 2 back to 1 unplays ply 2 (1...e5).
  expect(movingPiece(replay, 1, 2)).toMatchObject({
    from: 'e5',
    to: 'e7',
    code: 'bP',
    direction: 'back',
    key: 1,
  });
  // Stepping back FROM the start position has no ply to unplay.
  expect(movingPiece(replay, -1, 0)).toBeNull();
  // Stepping back TO the start position unplays ply 1: the pawn flies home.
  expect(movingPiece(replay, 0, 1)).toEqual({
    from: 'e4',
    to: 'e2',
    code: 'wP',
    direction: 'back',
    key: 0,
  });
});

test('a jump, the start position and a no-op all snap', () => {
  const replay = parseReplay(OPERA_GAME);
  expect(movingPiece(replay, 12, 4)).toBeNull(); // clicked a far move in the list
  expect(movingPiece(replay, 33, 12)).toBeNull();
  expect(movingPiece(replay, 0, 0)).toBeNull(); // the start position
  expect(movingPiece(replay, 20, 20)).toBeNull(); // re-render, same index (engine flushes)
  expect(movingPiece(replay, 5, 5)).toBeNull();
});

test('identity survives promotion and en passant, where the destination square lies', () => {
  // a8=Q flies the PAWN into a square that then holds a queen.
  const promo = parseReplay('[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+');
  expect(movingPiece(promo, 1, 0)!.code).toBe('wP');

  // En passant: the captured pawn is not on the destination square at all.
  const ep = parseReplay(
    '[FEN "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"]\n\n1. exd6',
  );
  expect(movingPiece(ep, 1, 0)).toMatchObject({
    from: 'e5',
    to: 'd6',
    code: 'wP',
  });
});
