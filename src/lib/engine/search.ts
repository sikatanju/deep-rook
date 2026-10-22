// Iterative-deepening PVS. Scores here are side-to-move relative ints; see the
// score-space note in board.ts. Everything a job touches (TT, killers,
// history) is reset per run(), so a search is a pure function of
// (position, limits) unless the time cap binds.

import {
  INF,
  MATE,
  MAX_PLY,
  NO_MOVE,
  PAWN,
  isCapture,
  isMateScore,
  isPromotion,
  moveFlag,
  moveFrom,
  moveTo,
  FLAG_EP,
  type Move,
} from './board';
import { evaluate } from './evaluate';
import { MAX_MOVES, generateMoves, legalMoves } from './moves';
import type { Position } from './position';
import { see } from './see';
import {
  BOUND_EXACT,
  BOUND_LOWER,
  BOUND_UPPER,
  type TranspositionTable,
} from './tt';

/**
 * Stop at whichever binds first. `depth` and `nodes` are the deterministic
 * bounds; `maxMs` is the slow-machine safety cap. A partial iteration is
 * discarded, so the result is always the last completed depth.
 */
export type Limits = { depth: number; nodes: number; maxMs: number };

/** A line from the root: its side-to-move score and its moves. */
export type Variation = { score: number; pv: Move[] };

export type Iteration = Variation & {
  depth: number;
  /**
   * The best line whose first move differs from `pv[0]`, searched to the same
   * depth. Absent when the root has a single legal move.
   */
  second?: Variation;
  nodes: number;
};

export type StopReason = 'depth' | 'nodes' | 'time' | 'mate';

export type SearchResult = {
  best: Iteration;
  reason: StopReason;
  nodes: number;
  ms: number;
};

/** Victim and attacker values for MVV-LVA ordering, by piece type. */
const VALUE = [0, 100, 320, 330, 500, 900, 0];

const PV_WIDTH = MAX_PLY + 1;

// LMR reduction by [depth][move number], both capped at 63.
const LMR = new Uint8Array(64 * 64);
for (let d = 1; d < 64; d++) {
  for (let m = 1; m < 64; m++)
    LMR[d * 64 + m] = Math.floor(0.75 + (Math.log(d) * Math.log(m)) / 2.25);
}

const now = () => performance.now();

/** One per worker; preallocates every buffer the search touches. */
export class Searcher {
  private readonly moves = new Int32Array(MAX_PLY * MAX_MOVES);
  private readonly order = new Int32Array(MAX_PLY * MAX_MOVES);
  private readonly killers = new Int32Array(MAX_PLY * 2);
  /** Butterfly history [side][from][to] over 0x88 squares. */
  private readonly history = new Int32Array(2 * 128 * 128);
  private readonly pvTable = new Int32Array(PV_WIDTH * PV_WIDTH);
  private readonly pvLength = new Int32Array(PV_WIDTH);

  private nodes = 0;
  private maxNodes = 0;
  private deadline = 0;
  private stop: StopReason | null = null;
  /** Limits apply only after depth 1, so every result has a best move. */
  private armed = false;
  /** A root move the current search skips: the first line's move, while the second line is searched. */
  private excluded: Move = NO_MOVE;

  constructor(private readonly tt: TranspositionTable) {}

  /** The root must have at least one legal move; engine.ts handles terminal roots. */
  run(
    pos: Position,
    limits: Limits,
    onIteration: (it: Iteration) => void,
  ): SearchResult {
    const start = now();
    this.tt.clear();
    this.history.fill(0);
    this.killers.fill(0);
    this.nodes = 0;
    this.maxNodes = limits.nodes;
    this.deadline = start + limits.maxMs;
    this.stop = null;
    this.armed = false;

    // With one legal move, excluding it would leave a root that reads as mate or stalemate.
    const multi = legalMoves(pos).length >= 2;
    let best: Iteration | undefined;
    let reason: StopReason = 'depth';
    for (let depth = 1; depth <= Math.min(limits.depth, MAX_PLY - 1); depth++) {
      const first = this.line(pos, depth, best?.score ?? 0, NO_MOVE);
      const second =
        multi && !this.stop
          ? this.line(pos, depth, best?.second?.score ?? 0, first.pv[0]!)
          : undefined;
      if (this.stop) {
        reason = this.stop;
        break;
      }
      this.armed = true;
      // Search instability (a reduced search of the second move failing low)
      // can score the second line above the first; the higher one is best.
      const [top, next]: [Variation, Variation?] =
        second && second.score > first.score
          ? [second, first]
          : [first, second];
      best = {
        ...top,
        depth,
        ...(next && { second: next }),
        nodes: this.nodes,
      };
      onIteration(best);
      if (isMateScore(top.score) && MATE - Math.abs(top.score) <= depth) {
        reason = 'mate';
        break;
      }
    }
    return { best: best!, reason, nodes: this.nodes, ms: now() - start };
  }

  /**
   * One root search that skips `excluded`, with its aspiration window centred
   * on `prev`. The PV is copied out before the next search overwrites it.
   */
  private line(
    pos: Position,
    depth: number,
    prev: number,
    excluded: Move,
  ): Variation {
    this.excluded = excluded;
    const score = this.aspiration(pos, depth, prev);
    this.excluded = NO_MOVE;
    return {
      score,
      pv: Array.from(this.pvTable.subarray(0, this.pvLength[0]!)),
    };
  }

  private aspiration(pos: Position, depth: number, prev: number): number {
    let delta = 30;
    let alpha = -INF;
    let beta = INF;
    if (depth >= 5 && !isMateScore(prev)) {
      alpha = prev - delta;
      beta = prev + delta;
    }
    for (;;) {
      const score = this.pvs(pos, depth, alpha, beta, 0, true);
      if (this.stop) return score;
      if (score > alpha && score < beta) return score;
      delta *= 2;
      if (delta > 500) {
        alpha = -INF;
        beta = INF;
      } else if (score <= alpha) {
        alpha = Math.max(-INF, score - delta);
      } else {
        beta = Math.min(INF, score + delta);
      }
    }
  }

  private tick(): boolean {
    this.nodes++;
    if (!this.armed) return false;
    if (this.nodes >= this.maxNodes) this.stop = 'nodes';
    else if ((this.nodes & 2047) === 0 && now() > this.deadline)
      this.stop = 'time';
    return this.stop !== null;
  }

  private pvs(
    pos: Position,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    allowNull: boolean,
  ): number {
    this.pvLength[ply] = ply;
    if (this.tick()) return 0;
    const pvNode = beta - alpha > 1;

    if (ply > 0) {
      if (pos.isRepetition() || pos.isInsufficientMaterial()) return 0;
      // The 50-move rule draws unless the move that reached 100 gave mate.
      if (pos.halfmove >= 100)
        return pos.inCheck() && legalMoves(pos).length === 0 ? -MATE + ply : 0;
      // Mate distance pruning: no line from here beats a mate already found nearer the root.
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    if (ply >= MAX_PLY - 1) return evaluate(pos);

    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(pos, alpha, beta, ply);

    const keyLo = pos.hashLo;
    const keyHi = pos.hashHi;
    let ttMove = NO_MOVE;
    const at = this.tt.probe(keyLo, keyHi);
    if (at >= 0) {
      ttMove = this.tt.move(at);
      if (!pvNode && this.tt.depth(at) >= depth) {
        const s = this.tt.score(at, ply);
        const bound = this.tt.bound(at);
        if (
          bound === BOUND_EXACT ||
          (bound === BOUND_LOWER && s >= beta) ||
          (bound === BOUND_UPPER && s <= alpha)
        ) {
          return s;
        }
      }
    }

    if (!pvNode && !inCheck) {
      const staticEval = evaluate(pos);
      // Reverse futility: far enough above beta that a shallow search will not drop below it.
      if (depth <= 6 && !isMateScore(beta) && staticEval - 80 * depth >= beta)
        return staticEval;
      if (
        allowNull &&
        depth >= 3 &&
        staticEval >= beta &&
        pos.hasNonPawnMaterial()
      ) {
        const r = 3 + ((depth / 6) | 0);
        pos.makeNull();
        const s = -this.pvs(
          pos,
          depth - 1 - r,
          -beta,
          -beta + 1,
          ply + 1,
          false,
        );
        pos.unmakeNull();
        if (this.stop) return 0;
        if (s >= beta) return isMateScore(s) ? beta : s;
      }
    }

    const base = ply * MAX_MOVES;
    const end = generateMoves(pos, this.moves, base, false);
    this.scoreMoves(pos, base, end, ttMove, ply);

    const origAlpha = alpha;
    let bestScore = -INF;
    let bestMove = NO_MOVE;
    let legal = 0;
    for (let i = base; i < end; i++) {
      const m = this.pickNext(i, end);
      if (ply === 0 && m === this.excluded) continue;
      // Losing captures sort last; once a move is searched, shallow cut nodes skip them.
      if (this.order[i]! < 0 && !pvNode && !inCheck && depth <= 4 && legal > 0)
        continue;
      if (!pos.make(m)) continue;
      legal++;
      const quiet = !isCapture(m) && !isPromotion(m);
      let s: number;
      if (legal === 1) {
        s = -this.pvs(pos, depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let r = 0;
        if (depth >= 3 && legal > 3 && quiet && !inCheck && !pos.inCheck()) {
          r =
            LMR[Math.min(depth, 63) * 64 + Math.min(legal, 63)]! -
            (pvNode ? 1 : 0);
          r = Math.max(0, Math.min(r, depth - 2));
        }
        s = -this.pvs(pos, depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && r > 0)
          s = -this.pvs(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && s < beta)
          s = -this.pvs(pos, depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stop) return 0;

      if (s <= bestScore) continue;
      bestScore = s;
      bestMove = m;
      if (s <= alpha) continue;
      alpha = s;
      this.updatePv(ply, m);
      if (s >= beta) {
        if (quiet) this.rewardQuiet(pos, m, depth, ply);
        break;
      }
    }

    if (legal === 0) return inCheck ? -MATE + ply : 0;
    const bound =
      bestScore >= beta
        ? BOUND_LOWER
        : bestScore > origAlpha
          ? BOUND_EXACT
          : BOUND_UPPER;
    // A root with a move excluded is not the position's value. Skipping the
    // store also keeps the first line's move as the next iteration's TT move.
    if (ply > 0 || this.excluded === NO_MOVE)
      this.tt.store(keyLo, keyHi, depth, bound, bestScore, bestMove, ply);
    return bestScore;
  }

  /**
   * Captures and queen promotions until the position is quiet. In check, all
   * evasions are searched with no stand-pat, so quiescence never misses a mate.
   */
  private quiesce(
    pos: Position,
    alpha: number,
    beta: number,
    ply: number,
  ): number {
    this.pvLength[ply] = ply;
    if (this.tick()) return 0;
    if (ply >= MAX_PLY - 1) return evaluate(pos);
    if (pos.isInsufficientMaterial()) return 0;

    const inCheck = pos.inCheck();
    let bestScore = -INF;
    let standPat = 0;
    if (!inCheck) {
      standPat = evaluate(pos);
      if (standPat >= beta) return standPat;
      if (standPat > alpha) alpha = standPat;
      bestScore = standPat;
    }

    const base = ply * MAX_MOVES;
    const end = generateMoves(pos, this.moves, base, !inCheck);
    this.scoreMoves(pos, base, end, NO_MOVE, ply);
    let legal = 0;
    for (let i = base; i < end; i++) {
      const m = this.pickNext(i, end);
      // Delta pruning: even winning the victim for free cannot reach alpha.
      if (
        !inCheck &&
        !isPromotion(m) &&
        standPat + this.victimValue(pos, m) + 200 < alpha
      )
        continue;
      // Sorted last, so the first losing capture ends the useful ones.
      if (!inCheck && this.order[i]! < 0) break;
      if (!pos.make(m)) continue;
      legal++;
      const s = -this.quiesce(pos, -beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stop) return 0;
      if (s <= bestScore) continue;
      bestScore = s;
      if (s <= alpha) continue;
      alpha = s;
      this.updatePv(ply, m);
      if (s >= beta) break;
    }
    if (inCheck && legal === 0) return -MATE + ply;
    return bestScore;
  }

  private victimValue(pos: Position, m: Move): number {
    return moveFlag(m) === FLAG_EP
      ? VALUE[PAWN]!
      : VALUE[pos.board[moveTo(m)]! & 7]!;
  }

  /**
   * Ordering: TT move, captures that do not lose material by MVV-LVA,
   * promotions, two killers, quiets by history, then losing captures.
   * History is capped below the killer band.
   */
  private scoreMoves(
    pos: Position,
    start: number,
    end: number,
    ttMove: Move,
    ply: number,
  ): void {
    const k1 = this.killers[ply * 2]!;
    const k2 = this.killers[ply * 2 + 1]!;
    const side = pos.side >> 3;
    for (let i = start; i < end; i++) {
      const m = this.moves[i]!;
      let score: number;
      if (m === ttMove) score = 2_000_000;
      else if (isCapture(m)) {
        const victim = this.victimValue(pos, m);
        const attacker = VALUE[pos.board[moveFrom(m)]! & 7]!;
        // A capture of something worth at least the capturer cannot lose material.
        const losing = attacker > victim && see(pos, m) < 0;
        score = (losing ? -1_000_000 : 1_000_000) + victim * 10 - attacker / 10;
      } else if (isPromotion(m)) score = 900_000 + (moveFlag(m) & 3);
      else if (m === k1) score = 800_000;
      else if (m === k2) score = 790_000;
      else score = this.history[side * 16384 + moveFrom(m) * 128 + moveTo(m)]!;
      this.order[i] = score;
    }
  }

  /** Selection sort, one step: most nodes cut after a move or two. */
  private pickNext(i: number, end: number): Move {
    let bestAt = i;
    for (let j = i + 1; j < end; j++)
      if (this.order[j]! > this.order[bestAt]!) bestAt = j;
    const m = this.moves[bestAt]!;
    const o = this.order[bestAt]!;
    this.moves[bestAt] = this.moves[i]!;
    this.order[bestAt] = this.order[i]!;
    this.moves[i] = m;
    this.order[i] = o;
    return m;
  }

  private updatePv(ply: number, m: Move): void {
    const row = ply * PV_WIDTH;
    const child = (ply + 1) * PV_WIDTH;
    this.pvTable[row + ply] = m;
    const len = this.pvLength[ply + 1]!;
    for (let j = ply + 1; j < len; j++)
      this.pvTable[row + j] = this.pvTable[child + j]!;
    this.pvLength[ply] = Math.max(len, ply + 1);
  }

  private rewardQuiet(
    pos: Position,
    m: Move,
    depth: number,
    ply: number,
  ): void {
    if (this.killers[ply * 2] !== m) {
      this.killers[ply * 2 + 1] = this.killers[ply * 2]!;
      this.killers[ply * 2] = m;
    }
    const i = (pos.side >> 3) * 16384 + moveFrom(m) * 128 + moveTo(m);
    this.history[i] = Math.min(700_000, this.history[i]! + depth * depth);
  }
}
