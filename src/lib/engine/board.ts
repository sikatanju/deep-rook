// Representation constants: 0x88 squares, piece codes, packed moves. No state.
//
// 0x88, not bitboards: JS has no native 64-bit int. BigInt bitboards allocate,
// and split 32-bit halves double every hot operation. A 128-byte 0x88 board
// keeps every value a small int and detects off-board steps with one AND.

import type { Square } from 'chess.js';

/** 0x88 index: rank * 16 + file. a1 = 0, h1 = 7, a8 = 0x70, h8 = 0x77. */
export type Sq = number;
export const NO_SQ = -1;
export const offBoard = (sq: number) => (sq & 0x88) !== 0;

/** The color bit of a piece code, so `piece & 8` reads it. */
export type Color = 0 | 8;
export const WHITE: Color = 0;
export const BLACK: Color = 8;
/** 0 or 1, for indexing per-color typed arrays. */
export const side = (color: Color) => color >> 3;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** color | type; 0 is empty. Range 0..14. */
export type Piece = number;
export const EMPTY = 0;
export const pieceType = (p: Piece) => p & 7;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

/** Rights kept when a move touches the square: `castling &= MASK[from] & MASK[to]`. */
export const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~CASTLE_WQ;
CASTLE_MASK[0x04] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[0x07] = 15 & ~CASTLE_WK;
CASTLE_MASK[0x70] = 15 & ~CASTLE_BQ;
CASTLE_MASK[0x74] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[0x77] = 15 & ~CASTLE_BK;

/**
 * Packed move, a plain int so move lists are Int32Array.
 *   bits 0..6 from, bits 7..13 to, bits 14..17 flag.
 * Flag bit 2 = capture, bit 3 = promotion; a promotion's low 2 bits pick
 * N/B/R/Q. Unbranded so typed-array reads need no cast; it never leaves the
 * engine (the public form is a UCI string).
 */
export type Move = number;
export const NO_MOVE = 0;
export const FLAG_QUIET = 0;
export const FLAG_DOUBLE_PUSH = 1;
export const FLAG_CASTLE_KING = 2;
export const FLAG_CASTLE_QUEEN = 3;
export const FLAG_CAPTURE = 4;
export const FLAG_EP = 5;
export const FLAG_PROMO = 8;

export const moveFrom = (m: Move): Sq => m & 0x7f;
export const moveTo = (m: Move): Sq => (m >> 7) & 0x7f;
export const moveFlag = (m: Move) => (m >> 14) & 0xf;
export const isCapture = (m: Move) => (moveFlag(m) & FLAG_CAPTURE) !== 0;
export const isPromotion = (m: Move) => (moveFlag(m) & FLAG_PROMO) !== 0;
/** KNIGHT..QUEEN; only meaningful when isPromotion. */
export const promoType = (m: Move) => (moveFlag(m) & 3) + KNIGHT;
export const encodeMove = (from: Sq, to: Sq, flag: number): Move =>
  from | (to << 7) | (flag << 14);

export const KNIGHT_STEPS = [33, 31, 18, 14, -33, -31, -18, -14];
export const BISHOP_STEPS = [17, 15, -17, -15];
export const ROOK_STEPS = [16, 1, -16, -1];
export const KING_STEPS = [17, 16, 15, 1, -1, -15, -16, -17];

/** The 64 on-board squares, a1..h8. */
export const BOARD_SQUARES = Int16Array.from(
  { length: 64 },
  (_, i) => (i >> 3) * 16 + (i & 7),
);

export function squareName(sq: Sq): Square {
  return `${'abcdefgh'[sq & 7]}${(sq >> 4) + 1}` as Square;
}

/** "e4" to 0x88, or NO_SQ. */
export function parseSquare(name: string): Sq {
  if (!/^[a-h][1-8]$/.test(name)) return NO_SQ;
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
}

/** UCI long algebraic: "e2e4", "a7a8q". */
export function toUci(m: Move): string {
  const promo = isPromotion(m) ? 'nbrq'[moveFlag(m) & 3] : '';
  return squareName(moveFrom(m)) + squareName(moveTo(m)) + promo;
}

// Score space, side-to-move relative inside the engine:
//   draw 0; normal |s| < MATE_BOUND; mate for the mover MATE - plies; mated -(MATE - plies).
// Only engine.ts's toScore converts to the public White-POV Score.
export const MAX_PLY = 96;
export const MATE = 32000;
export const MATE_BOUND = MATE - MAX_PLY;
export const INF = 32001;
export const isMateScore = (s: number) => Math.abs(s) >= MATE_BOUND;
