// Transposition table: one Int32Array, four ints per entry, no objects.
//   [0] key hi (verification; the index comes from key lo)
//   [1] best move
//   [2] score (mate scores node-relative)
//   [3] depth (bits 0..7) | bound (bits 8..9) | used (bit 10)
// 16 bytes per entry; 2^19 entries = 8 MiB per worker. Cleared per job so a
// search is a pure function of its request.

import { MATE_BOUND } from './board';

export const BOUND_EXACT = 0;
export const BOUND_LOWER = 1;
export const BOUND_UPPER = 2;
export type Bound =
  typeof BOUND_EXACT | typeof BOUND_LOWER | typeof BOUND_UPPER;

export const DEFAULT_TT_BITS = 19;

const USED = 1 << 10;

export class TranspositionTable {
  private readonly data: Int32Array;
  private readonly mask: number;

  constructor(bits = DEFAULT_TT_BITS) {
    this.data = new Int32Array((1 << bits) * 4);
    this.mask = (1 << bits) - 1;
  }

  clear(): void {
    this.data.fill(0);
  }

  /** Offset of the entry for this key, or -1 on a miss. Read fields with the accessors. */
  probe(lo: number, hi: number): number {
    const at = (lo & this.mask) * 4;
    return this.data[at + 3]! & USED && this.data[at] === hi ? at : -1;
  }

  move(at: number): number {
    return this.data[at + 1]!;
  }

  depth(at: number): number {
    return this.data[at + 3]! & 0xff;
  }

  bound(at: number): Bound {
    return ((this.data[at + 3]! >> 8) & 3) as Bound;
  }

  /** Score with mate distance converted back to root-relative at `ply`. */
  score(at: number, ply: number): number {
    const s = this.data[at + 2]!;
    if (s >= MATE_BOUND) return s - ply;
    if (s <= -MATE_BOUND) return s + ply;
    return s;
  }

  /**
   * Depth-preferred: replaces a different key only when the new search is at
   * least as deep. Keeps an existing move when the new entry has none.
   */
  store(
    lo: number,
    hi: number,
    depth: number,
    bound: Bound,
    score: number,
    move: number,
    ply: number,
  ): void {
    const at = (lo & this.mask) * 4;
    const d = this.data;
    const sameKey = d[at] === hi;
    if (!sameKey && d[at + 3]! & USED && (d[at + 3]! & 0xff) > depth) return;
    if (score >= MATE_BOUND) score += ply;
    else if (score <= -MATE_BOUND) score -= ply;
    d[at] = hi;
    if (move || !sameKey) d[at + 1] = move;
    d[at + 2] = score;
    d[at + 3] = depth | (bound << 8) | USED;
  }
}
