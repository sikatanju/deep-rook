// Pseudo-legal move generation into caller-owned typed arrays (no allocation
// per node). The legality filter is Position.make() returning false.

import {
  BISHOP_STEPS,
  BLACK,
  BOARD_SQUARES,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  FLAG_CAPTURE,
  FLAG_CASTLE_KING,
  FLAG_CASTLE_QUEEN,
  FLAG_DOUBLE_PUSH,
  FLAG_EP,
  FLAG_PROMO,
  FLAG_QUIET,
  KING_STEPS,
  KNIGHT_STEPS,
  ROOK_STEPS,
  WHITE,
  encodeMove,
  type Color,
  type Move,
} from './board';
import type { Position } from './position';

/** The most pseudo-legal moves in any reachable position is 218. */
export const MAX_MOVES = 256;

const QUEEN_PROMO = FLAG_PROMO | 3;

/**
 * Writes pseudo-legal moves for the side to move into `out` from `start`,
 * returns the new end. `capturesOnly` emits captures and queen promotions,
 * which is what quiescence wants.
 *
 * Castling is emitted only when the king's from and through squares are not
 * attacked, so make()'s king-in-check test covers every move kind.
 */
export function generateMoves(
  pos: Position,
  out: Int32Array,
  start: number,
  capturesOnly: boolean,
): number {
  const b = pos.board;
  const us = pos.side;
  const them = (us ^ BLACK) as Color;
  let n = start;

  for (let i = 0; i < 64; i++) {
    const from = BOARD_SQUARES[i]!;
    const piece = b[from]!;
    if (!piece || (piece & 8) !== us) continue;

    switch (piece & 7) {
      case 1: {
        const dir = us === WHITE ? 16 : -16;
        const rank = from >> 4;
        const promotes = rank === (us === WHITE ? 6 : 1);
        const to = from + dir;
        if (!b[to]) {
          if (promotes) {
            if (capturesOnly) out[n++] = encodeMove(from, to, QUEEN_PROMO);
            else
              for (let p = 3; p >= 0; p--)
                out[n++] = encodeMove(from, to, FLAG_PROMO | p);
          } else if (!capturesOnly) {
            out[n++] = encodeMove(from, to, FLAG_QUIET);
            if (rank === (us === WHITE ? 1 : 6) && !b[to + dir])
              out[n++] = encodeMove(from, to + dir, FLAG_DOUBLE_PUSH);
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const t = to + side;
          if (t & 0x88) continue;
          const target = b[t]!;
          if (target && (target & 8) === them) {
            if (!promotes) out[n++] = encodeMove(from, t, FLAG_CAPTURE);
            else if (capturesOnly)
              out[n++] = encodeMove(from, t, QUEEN_PROMO | FLAG_CAPTURE);
            else
              for (let p = 3; p >= 0; p--)
                out[n++] = encodeMove(from, t, FLAG_PROMO | FLAG_CAPTURE | p);
          } else if (t === pos.ep) {
            out[n++] = encodeMove(from, t, FLAG_EP);
          }
        }
        break;
      }
      case 2:
        n = leaper(b, from, KNIGHT_STEPS, them, capturesOnly, out, n);
        break;
      case 3:
        n = slider(b, from, BISHOP_STEPS, them, capturesOnly, out, n);
        break;
      case 4:
        n = slider(b, from, ROOK_STEPS, them, capturesOnly, out, n);
        break;
      case 5:
        n = slider(b, from, BISHOP_STEPS, them, capturesOnly, out, n);
        n = slider(b, from, ROOK_STEPS, them, capturesOnly, out, n);
        break;
      case 6:
        n = leaper(b, from, KING_STEPS, them, capturesOnly, out, n);
        if (!capturesOnly && pos.castling) n = castles(pos, from, them, out, n);
        break;
    }
  }
  return n;
}

function leaper(
  b: Uint8Array,
  from: number,
  steps: readonly number[],
  them: Color,
  capturesOnly: boolean,
  out: Int32Array,
  n: number,
): number {
  for (const step of steps) {
    const to = from + step;
    if (to & 0x88) continue;
    const target = b[to]!;
    if (!target) {
      if (!capturesOnly) out[n++] = encodeMove(from, to, FLAG_QUIET);
    } else if ((target & 8) === them) {
      out[n++] = encodeMove(from, to, FLAG_CAPTURE);
    }
  }
  return n;
}

function slider(
  b: Uint8Array,
  from: number,
  steps: readonly number[],
  them: Color,
  capturesOnly: boolean,
  out: Int32Array,
  n: number,
): number {
  for (const step of steps) {
    for (let to = from + step; !(to & 0x88); to += step) {
      const target = b[to]!;
      if (!target) {
        if (!capturesOnly) out[n++] = encodeMove(from, to, FLAG_QUIET);
        continue;
      }
      if ((target & 8) === them) out[n++] = encodeMove(from, to, FLAG_CAPTURE);
      break;
    }
  }
  return n;
}

function castles(
  pos: Position,
  king: number,
  them: Color,
  out: Int32Array,
  n: number,
): number {
  const b = pos.board;
  const white = pos.side === WHITE;
  const kingSide = white ? CASTLE_WK : CASTLE_BK;
  const queenSide = white ? CASTLE_WQ : CASTLE_BQ;
  if (!(pos.castling & (kingSide | queenSide)) || pos.isAttacked(king, them))
    return n;
  // parseFen and CASTLE_MASK guarantee the king is on e1/e8 when a right is set.
  if (
    pos.castling & kingSide &&
    !b[king + 1] &&
    !b[king + 2] &&
    !pos.isAttacked(king + 1, them)
  ) {
    out[n++] = encodeMove(king, king + 2, FLAG_CASTLE_KING);
  }
  if (
    pos.castling & queenSide &&
    !b[king - 1] &&
    !b[king - 2] &&
    !b[king - 3] &&
    !pos.isAttacked(king - 1, them)
  ) {
    out[n++] = encodeMove(king, king - 2, FLAG_CASTLE_QUEEN);
  }
  return n;
}

const scratch = new Int32Array(MAX_MOVES);

/** Legal moves as a fresh array. Root, tests, and boundaries only; never in search. */
export function legalMoves(pos: Position): Move[] {
  const end = generateMoves(pos, scratch, 0, false);
  const legal: Move[] = [];
  for (let i = 0; i < end; i++) {
    const m = scratch[i]!;
    if (pos.make(m)) {
      pos.unmake();
      legal.push(m);
    }
  }
  return legal;
}
