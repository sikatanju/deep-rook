// The mutable position: board, side, rights, Zobrist key, incremental eval
// sums, and the undo stack. put/remove are the only writers of `board`, so
// every incremental field stays in sync with it in one place.

import {
  BISHOP,
  BISHOP_STEPS,
  BLACK,
  BOARD_SQUARES,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_MASK,
  CASTLE_WK,
  CASTLE_WQ,
  EMPTY,
  FLAG_CAPTURE,
  FLAG_CASTLE_KING,
  FLAG_CASTLE_QUEEN,
  FLAG_DOUBLE_PUSH,
  FLAG_EP,
  FLAG_PROMO,
  KING,
  KING_STEPS,
  KNIGHT,
  KNIGHT_STEPS,
  NO_MOVE,
  NO_SQ,
  PAWN,
  QUEEN,
  ROOK,
  ROOK_STEPS,
  WHITE,
  moveFlag,
  moveFrom,
  moveTo,
  parseSquare,
  promoType,
  squareName,
  type Color,
  type Move,
  type Piece,
  type Sq,
} from './board';
import { PHASE_WEIGHT, PST_EG, PST_MG } from './evaluate';

/** Game history before the root (at most 100 plies matter) plus search plies. */
const STACK_SIZE = 512;

// Fixed-seed keys, so hashes match across workers, runs, and a future server.
let seed = 0x9e3779b9;
function random32(): number {
  // splitmix32
  seed = (seed + 0x9e3779b9) | 0;
  let z = seed;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return z ^ (z >>> 16);
}
const randomTable = (n: number) => Int32Array.from({ length: n }, random32);

const Z_PIECE_LO = randomTable(16 * 128);
const Z_PIECE_HI = randomTable(16 * 128);
const Z_CASTLE_LO = randomTable(16);
const Z_CASTLE_HI = randomTable(16);
const Z_EP_LO = randomTable(8);
const Z_EP_HI = randomTable(8);
const Z_SIDE_LO = random32();
const Z_SIDE_HI = random32();

export class Position {
  /** Piece codes on 0x88 squares; the off-board half stays EMPTY. */
  readonly board = new Uint8Array(128);
  side: Color = WHITE;
  castling = 0;
  /** Set only when a pawn of the side to move stands next to the double-pushed pawn, so equal positions hash equal. */
  ep: Sq = NO_SQ;
  halfmove = 0;
  fullmove = 1;
  /** King squares by side (0 white, 1 black). */
  readonly kings = new Int16Array(2);
  readonly counts = new Uint8Array(16);
  hashLo = 0;
  hashHi = 0;
  /** PeSTO sums by side, so evaluate() is O(1). */
  readonly mg = new Int32Array(2);
  readonly eg = new Int32Array(2);
  phase = 0;

  // Undo stack. Index `sp` is the next free slot. keys[i] is the key of the
  // position before stack entry i, including game-history entries pushed
  // before the root, so repetition detection is one loop.
  private sp = 0;
  /** Stack index of the root's key; entries at or below it are game positions. */
  private root = 0;
  private readonly undoMove = new Int32Array(STACK_SIZE);
  private readonly undoCaptured = new Uint8Array(STACK_SIZE);
  private readonly undoCastling = new Uint8Array(STACK_SIZE);
  private readonly undoEp = new Int16Array(STACK_SIZE);
  private readonly undoHalfmove = new Uint16Array(STACK_SIZE);
  private readonly keysLo = new Int32Array(STACK_SIZE);
  private readonly keysHi = new Int32Array(STACK_SIZE);

  put(piece: Piece, sq: Sq): void {
    this.board[sq] = piece;
    const i = piece * 128 + sq;
    this.hashLo ^= Z_PIECE_LO[i]!;
    this.hashHi ^= Z_PIECE_HI[i]!;
    const s = piece >> 3;
    this.mg[s]! += PST_MG[i]!;
    this.eg[s]! += PST_EG[i]!;
    this.phase += PHASE_WEIGHT[piece]!;
    this.counts[piece]!++;
    if ((piece & 7) === KING) this.kings[s] = sq;
  }

  remove(sq: Sq): void {
    const piece = this.board[sq]!;
    this.board[sq] = EMPTY;
    const i = piece * 128 + sq;
    this.hashLo ^= Z_PIECE_LO[i]!;
    this.hashHi ^= Z_PIECE_HI[i]!;
    const s = piece >> 3;
    this.mg[s]! -= PST_MG[i]!;
    this.eg[s]! -= PST_EG[i]!;
    this.phase -= PHASE_WEIGHT[piece]!;
    this.counts[piece]!--;
  }

  setCastling(rights: number): void {
    this.hashLo ^= Z_CASTLE_LO[this.castling]! ^ Z_CASTLE_LO[rights]!;
    this.hashHi ^= Z_CASTLE_HI[this.castling]! ^ Z_CASTLE_HI[rights]!;
    this.castling = rights;
  }

  setEp(sq: Sq): void {
    if (this.ep !== NO_SQ) {
      this.hashLo ^= Z_EP_LO[this.ep & 7]!;
      this.hashHi ^= Z_EP_HI[this.ep & 7]!;
    }
    this.ep = sq;
    if (sq !== NO_SQ) {
      this.hashLo ^= Z_EP_LO[sq & 7]!;
      this.hashHi ^= Z_EP_HI[sq & 7]!;
    }
  }

  flipSide(): void {
    this.side = (this.side ^ BLACK) as Color;
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;
  }

  private push(move: Move, captured: Piece): void {
    const sp = this.sp++;
    this.undoMove[sp] = move;
    this.undoCaptured[sp] = captured;
    this.undoCastling[sp] = this.castling;
    this.undoEp[sp] = this.ep;
    this.undoHalfmove[sp] = this.halfmove;
    this.keysLo[sp] = this.hashLo;
    this.keysHi[sp] = this.hashHi;
  }

  /**
   * Plays a pseudo-legal move. Returns false, with the position restored,
   * when the move leaves the mover's king attacked. This is the engine's
   * whole legality check.
   */
  make(move: Move): boolean {
    const from = moveFrom(move);
    const to = moveTo(move);
    const flag = moveFlag(move);
    const us = this.side;
    const piece = this.board[from]!;
    let captured: Piece = EMPTY;
    let capSq = to;
    if (flag === FLAG_EP) capSq = us === WHITE ? to - 16 : to + 16;
    if (flag & FLAG_CAPTURE) captured = this.board[capSq]!;
    this.push(move, captured);

    if (captured) this.remove(capSq);
    this.remove(from);
    this.put(flag & FLAG_PROMO ? us | promoType(move) : piece, to);
    if (flag === FLAG_CASTLE_KING) {
      this.remove(to + 1);
      this.put(us | ROOK, to - 1);
    } else if (flag === FLAG_CASTLE_QUEEN) {
      this.remove(to - 2);
      this.put(us | ROOK, to + 1);
    }

    this.setCastling(this.castling & CASTLE_MASK[from]! & CASTLE_MASK[to]!);
    let ep = NO_SQ;
    if (flag === FLAG_DOUBLE_PUSH) {
      const enemyPawn = (us ^ BLACK) | PAWN;
      if (this.board[to - 1] === enemyPawn || this.board[to + 1] === enemyPawn)
        ep = (from + to) >> 1;
    }
    this.setEp(ep);
    this.halfmove = (piece & 7) === PAWN || captured ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.flipSide();

    if (this.isAttacked(this.kings[us >> 3]!, this.side)) {
      this.unmake();
      return false;
    }
    return true;
  }

  /** Exactly reverses the last make(). The key comes back from the stack. */
  unmake(): void {
    const sp = --this.sp;
    const move = this.undoMove[sp]!;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flag = moveFlag(move);
    this.side = (this.side ^ BLACK) as Color;
    const us = this.side;
    if (us === BLACK) this.fullmove--;

    const moved = this.board[to]!;
    this.remove(to);
    this.put(flag & FLAG_PROMO ? us | PAWN : moved, from);
    const captured = this.undoCaptured[sp]!;
    if (captured)
      this.put(
        captured,
        flag === FLAG_EP ? (us === WHITE ? to - 16 : to + 16) : to,
      );
    if (flag === FLAG_CASTLE_KING) {
      this.remove(to - 1);
      this.put(us | ROOK, to + 1);
    } else if (flag === FLAG_CASTLE_QUEEN) {
      this.remove(to + 1);
      this.put(us | ROOK, to - 2);
    }

    this.castling = this.undoCastling[sp]!;
    this.ep = this.undoEp[sp]!;
    this.halfmove = this.undoHalfmove[sp]!;
    this.hashLo = this.keysLo[sp]!;
    this.hashHi = this.keysHi[sp]!;
  }

  /** Pass the move, for null-move pruning. Resets the halfmove clock so repetition never spans it. */
  makeNull(): void {
    this.push(NO_MOVE, EMPTY);
    this.setEp(NO_SQ);
    this.halfmove = 0;
    this.flipSide();
  }

  unmakeNull(): void {
    const sp = --this.sp;
    this.side = (this.side ^ BLACK) as Color;
    this.ep = this.undoEp[sp]!;
    this.halfmove = this.undoHalfmove[sp]!;
    this.hashLo = this.keysLo[sp]!;
    this.hashHi = this.keysHi[sp]!;
  }

  /** Any piece of `by` attacks `sq`. Walks outward from the target. */
  isAttacked(sq: Sq, by: Color): boolean {
    const b = this.board;
    // A white pawn on s attacks s+15 and s+17, so look behind the target.
    const pawn = by | PAWN;
    const back = by === WHITE ? -16 : 16;
    if (!((sq + back - 1) & 0x88) && b[sq + back - 1] === pawn) return true;
    if (!((sq + back + 1) & 0x88) && b[sq + back + 1] === pawn) return true;
    for (const step of KNIGHT_STEPS) {
      const t = sq + step;
      if (!(t & 0x88) && b[t] === (by | KNIGHT)) return true;
    }
    for (const step of KING_STEPS) {
      const t = sq + step;
      if (!(t & 0x88) && b[t] === (by | KING)) return true;
    }
    if (this.ray(sq, BISHOP_STEPS, by | BISHOP, by | QUEEN)) return true;
    return this.ray(sq, ROOK_STEPS, by | ROOK, by | QUEEN);
  }

  private ray(sq: Sq, steps: readonly number[], a: Piece, b: Piece): boolean {
    for (const step of steps) {
      for (let t = sq + step; !(t & 0x88); t += step) {
        const p = this.board[t]!;
        if (p === EMPTY) continue;
        if (p === a || p === b) return true;
        break;
      }
    }
    return false;
  }

  inCheck(): boolean {
    return this.isAttacked(
      this.kings[this.side >> 3]!,
      (this.side ^ BLACK) as Color,
    );
  }

  /**
   * The current key repeats an earlier one since the last irreversible move.
   * A repeat of a position inside the search is a draw at once, since the
   * side that chose it can repeat again. Game positions (the root and the
   * history below it) need two earlier occurrences: an actual threefold.
   */
  isRepetition(): boolean {
    const stop = Math.max(0, this.sp - this.halfmove);
    let gameRepeats = 0;
    for (let i = this.sp - 2; i >= stop; i -= 2) {
      if (this.keysLo[i] !== this.hashLo || this.keysHi[i] !== this.hashHi)
        continue;
      if (i > this.root || ++gameRepeats === 2) return true;
    }
    return false;
  }

  /** Neither side can mate: K v K, K + one minor v K. */
  isInsufficientMaterial(): boolean {
    const c = this.counts;
    const heavy =
      c[PAWN]! +
      c[ROOK]! +
      c[QUEEN]! +
      c[BLACK | PAWN]! +
      c[BLACK | ROOK]! +
      c[BLACK | QUEEN]!;
    const minors =
      c[KNIGHT]! + c[BISHOP]! + c[BLACK | KNIGHT]! + c[BLACK | BISHOP]!;
    return heavy === 0 && minors <= 1;
  }

  /** The side to move has a piece other than pawns and king (null-move guard against zugzwang). */
  hasNonPawnMaterial(): boolean {
    const c = this.counts;
    const s = this.side;
    return c[s | KNIGHT]! + c[s | BISHOP]! + c[s | ROOK]! + c[s | QUEEN]! > 0;
  }

  /** Records an earlier game position's key below the root, oldest first, before any make(). */
  pushHistory(lo: number, hi: number): void {
    this.keysLo[this.sp] = lo;
    this.keysHi[this.sp] = hi;
    this.root = ++this.sp;
  }

  /** From-scratch values of the incremental fields, for tests. */
  recompute() {
    const fresh = new Position();
    for (const sq of BOARD_SQUARES)
      if (this.board[sq]) fresh.put(this.board[sq]!, sq);
    fresh.setCastling(this.castling);
    fresh.setEp(this.ep);
    if (this.side === BLACK) fresh.flipSide();
    return {
      hashLo: fresh.hashLo,
      hashHi: fresh.hashHi,
      mg: [fresh.mg[0]!, fresh.mg[1]!],
      eg: [fresh.eg[0]!, fresh.eg[1]!],
      phase: fresh.phase,
    };
  }
}

const PIECE_CHARS = ' PNBRQK  pnbrqk';

/** Parses FEN. Throws an Error naming the bad field. The engine's only input boundary. */
export function parseFen(fen: string): Position {
  const fields = fen.trim().split(/\s+/);
  const [placement, active, castling = '-', ep = '-', half = '0', full = '1'] =
    fields;
  const pos = new Position();
  const rows = placement?.split('/') ?? [];
  if (rows.length !== 8) throw new Error(`Bad FEN placement: ${fen}`);
  rows.forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const piece = PIECE_CHARS.indexOf(ch);
      if (piece <= 0 || file > 7) throw new Error(`Bad FEN placement: ${fen}`);
      pos.put(piece, (7 - i) * 16 + file++);
    }
    if (file !== 8) throw new Error(`Bad FEN placement: ${fen}`);
  });
  if (pos.counts[KING] !== 1 || pos.counts[BLACK | KING] !== 1)
    throw new Error(`FEN needs one king per side: ${fen}`);
  if (active !== 'w' && active !== 'b')
    throw new Error(`Bad FEN side to move: ${fen}`);

  // Rights not backed by a king and rook on their squares are dropped.
  const has = (sq: Sq, piece: Piece) => pos.board[sq] === piece;
  let rights = 0;
  if (castling.includes('K') && has(0x04, KING) && has(0x07, ROOK))
    rights |= CASTLE_WK;
  if (castling.includes('Q') && has(0x04, KING) && has(0x00, ROOK))
    rights |= CASTLE_WQ;
  if (
    castling.includes('k') &&
    has(0x74, BLACK | KING) &&
    has(0x77, BLACK | ROOK)
  )
    rights |= CASTLE_BK;
  if (
    castling.includes('q') &&
    has(0x74, BLACK | KING) &&
    has(0x70, BLACK | ROOK)
  )
    rights |= CASTLE_BQ;

  const epSq = parseSquare(ep);
  if (ep !== '-' && epSq === NO_SQ)
    throw new Error(`Bad FEN en passant square: ${fen}`);
  const halfmove = Number(half);
  const fullmove = Number(full);
  if (!Number.isInteger(halfmove) || !Number.isInteger(fullmove))
    throw new Error(`Bad FEN move counters: ${fen}`);

  if (active === 'b') pos.flipSide();
  pos.setCastling(rights);
  if (epSq !== NO_SQ) {
    const pushed = pos.side === WHITE ? epSq - 16 : epSq + 16;
    const ourPawn = pos.side | PAWN;
    if (pos.board[pushed - 1] === ourPawn || pos.board[pushed + 1] === ourPawn)
      pos.setEp(epSq);
  }
  pos.halfmove = halfmove;
  pos.fullmove = fullmove;
  return pos;
}

export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[rank * 16 + file]!;
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += PIECE_CHARS[p];
    }
    rows.push(empty ? row + empty : row);
  }
  const c = pos.castling;
  const rights =
    (c & CASTLE_WK ? 'K' : '') +
    (c & CASTLE_WQ ? 'Q' : '') +
    (c & CASTLE_BK ? 'k' : '') +
    (c & CASTLE_BQ ? 'q' : '');
  const ep = pos.ep === NO_SQ ? '-' : squareName(pos.ep);
  return `${rows.join('/')} ${pos.side === WHITE ? 'w' : 'b'} ${rights || '-'} ${ep} ${pos.halfmove} ${pos.fullmove}`;
}
