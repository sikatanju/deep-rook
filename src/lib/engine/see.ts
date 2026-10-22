// Static exchange evaluation: the material a capture sequence on one square
// nets for the side that starts it, both sides recapturing with their least
// valuable attacker and either free to stop. Sliders behind a removed piece
// join in, because the loop reads the board after each removal.

import {
  BISHOP,
  BISHOP_STEPS,
  FLAG_EP,
  KING,
  KING_STEPS,
  KNIGHT,
  KNIGHT_STEPS,
  PAWN,
  QUEEN,
  ROOK,
  ROOK_STEPS,
  moveFlag,
  moveFrom,
  moveTo,
  type Color,
  type Move,
  type Sq,
} from './board';
import type { Position } from './position';

/** Exchange values by piece type. The king is worth more than any exchange. */
export const SEE_VALUE = [0, 100, 320, 330, 500, 900, 20_000];

const gain = new Int32Array(40);
const touchedSq = new Int32Array(40);
const touchedPiece = new Int32Array(40);

/** Square of the cheapest piece of `by` attacking `sq`, or -1. */
function cheapestAttacker(board: Uint8Array, sq: Sq, by: Color): Sq {
  const back = by === 0 ? -16 : 16;
  for (const side of [-1, 1]) {
    const t = sq + back + side;
    if (!(t & 0x88) && board[t] === (by | PAWN)) return t;
  }
  for (const step of KNIGHT_STEPS) {
    const t = sq + step;
    if (!(t & 0x88) && board[t] === (by | KNIGHT)) return t;
  }
  let rook = -1;
  let queen = -1;
  for (const step of BISHOP_STEPS) {
    for (let t = sq + step; !(t & 0x88); t += step) {
      const p = board[t]!;
      if (p === 0) continue;
      if (p === (by | BISHOP)) return t;
      if (p === (by | QUEEN) && queen < 0) queen = t;
      break;
    }
  }
  for (const step of ROOK_STEPS) {
    for (let t = sq + step; !(t & 0x88); t += step) {
      const p = board[t]!;
      if (p === 0) continue;
      if (p === (by | ROOK)) {
        rook = t;
      } else if (p === (by | QUEEN) && queen < 0) queen = t;
      break;
    }
  }
  if (rook >= 0) return rook;
  if (queen >= 0) return queen;
  for (const step of KING_STEPS) {
    const t = sq + step;
    if (!(t & 0x88) && board[t] === (by | KING)) return t;
  }
  return -1;
}

/**
 * Net material for the mover of capture `m`, in centipawns. Promotion value is
 * ignored. The board is edited in place and restored before returning.
 */
export function see(pos: Position, m: Move): number {
  const board = pos.board;
  const from = moveFrom(m);
  const to = moveTo(m);
  const mover = board[from]!;
  const victim = moveFlag(m) === FLAG_EP ? PAWN : board[to]! & 7;

  let touched = 1;
  touchedSq[0] = from;
  touchedPiece[0] = mover;
  board[from] = 0;
  let sitting = SEE_VALUE[mover & 7]!;
  let by = ((mover & 8) ^ 8) as Color;
  let d = 0;
  gain[0] = SEE_VALUE[victim]!;
  for (;;) {
    const at = cheapestAttacker(board, to, by);
    if (at < 0) break;
    const piece = board[at]!;
    if (
      (piece & 7) === KING &&
      cheapestAttacker(board, to, (by ^ 8) as Color) >= 0
    )
      break;
    d++;
    gain[d] = sitting - gain[d - 1]!;
    if (Math.max(-gain[d - 1]!, gain[d]!) < 0) {
      d--;
      break;
    }
    sitting = SEE_VALUE[piece & 7]!;
    touchedSq[touched] = at;
    touchedPiece[touched++] = piece;
    board[at] = 0;
    by = (by ^ 8) as Color;
  }
  for (let i = 0; i < touched; i++) board[touchedSq[i]!] = touchedPiece[i]!;
  for (; d > 0; d--) gain[d - 1] = -Math.max(-gain[d - 1]!, gain[d]!);
  return gain[0]!;
}
