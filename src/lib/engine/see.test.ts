import { expect, test } from 'vitest';

import { encodeMove, parseSquare, FLAG_CAPTURE, FLAG_EP } from './board';
import { parseFen, toFen } from './position';
import { see } from './see';

const capture = (
  fen: string,
  from: string,
  to: string,
  flag = FLAG_CAPTURE,
) => {
  const pos = parseFen(fen);
  const before = [...pos.board];
  const value = see(pos, encodeMove(parseSquare(from), parseSquare(to), flag));
  expect([...pos.board]).toEqual(before);
  expect(toFen(pos)).toBe(toFen(parseFen(fen)));
  return value;
};

test('a free pawn nets a pawn', () => {
  expect(capture('4k3/8/8/3p4/8/8/3R4/4K3 w - - 0 1', 'd2', 'd5')).toBe(100);
});

test('a pawn defended by a pawn costs the queen that takes it', () => {
  expect(capture('4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1', 'd2', 'd5')).toBe(-800);
});

test('a pawn takes a defended pawn and comes out even', () => {
  expect(capture('4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1', 'e4', 'd5')).toBe(0);
});

test('a rook behind the first joins the exchange', () => {
  // Rxd5 exd5 Rxd5: white wins a pawn, a rook for a rook and a pawn.
  expect(capture('3rk3/8/8/3p4/8/8/3R4/3RK3 w - - 0 1', 'd2', 'd5')).toBe(100);
});

test('x-rays on both sides decide the exchange', () => {
  expect(capture('3r4/3r4/8/3p4/8/8/3R4/3RK2k w - - 0 1', 'd2', 'd5')).toBe(
    -400,
  );
});

test('the king cannot recapture into an attacked square', () => {
  expect(capture('8/8/8/3k4/3p4/8/3R4/3RK3 w - - 0 1', 'd2', 'd4')).toBe(100);
});

test('en passant wins the pawn', () => {
  expect(
    capture('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5', 'd6', FLAG_EP),
  ).toBe(100);
});
