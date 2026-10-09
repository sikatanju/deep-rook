// The engine's one public entry. Pure TS, no DOM: the worker wraps it, tests
// call it directly, and a server could run the same file. It owns the two
// conversions that happen exactly once: FEN strings in, White-POV Line out.

import type { Line, Score } from '@/lib/chess/score';

import {
  BLACK,
  MATE,
  WHITE,
  isMateScore,
  toUci,
  type Color,
  type Move,
} from './board';
import { legalMoves } from './moves';
import { parseFen } from './position';
import { Searcher, type Limits, type StopReason } from './search';
import { TranspositionTable } from './tt';

/**
 * Everything one search needs, so no executor holds game state.
 * `history` lists earlier game FENs back to the last irreversible move,
 * oldest first, excluding `fen`; it only feeds repetition detection.
 */
export type SearchRequest = Limits & {
  fen: string;
  history: readonly string[];
};

export type SearchOutcome = {
  line: Line;
  /** 'terminal': no legal moves at the root. */
  reason: StopReason | 'terminal';
  nodes: number;
  ms: number;
};

export type Engine = {
  /**
   * Runs one search synchronously. Calls `onLine` after each completed
   * iteration. Deterministic for a given request unless `reason` is 'time'.
   * Throws only on a malformed FEN.
   */
  search(request: SearchRequest, onLine?: (line: Line) => void): SearchOutcome;
};

export function createEngine(): Engine {
  const searcher = new Searcher(new TranspositionTable());
  return {
    search(request, onLine) {
      const pos = parseFen(request.fen);
      for (const fen of request.history) {
        const past = parseFen(fen);
        pos.pushHistory(past.hashLo, past.hashHi);
      }
      const stm = pos.side;
      if (legalMoves(pos).length === 0) {
        const score: Score = pos.inCheck()
          ? { kind: 'mate', winner: stm === WHITE ? 'b' : 'w', moves: 0 }
          : { kind: 'cp', cp: 0 };
        return {
          line: { score, pv: [], depth: 0 },
          reason: 'terminal',
          nodes: 0,
          ms: 0,
        };
      }
      const toLine = (it: {
        depth: number;
        score: number;
        pv: Move[];
      }): Line => ({
        score: toScore(it.score, stm),
        pv: it.pv.map(toUci),
        depth: it.depth,
      });
      const result = searcher.run(pos, request, (it) => onLine?.(toLine(it)));
      return {
        line: toLine(result.best),
        reason: result.reason,
        nodes: result.nodes,
        ms: result.ms,
      };
    },
  };
}

/** Side-to-move score to White-POV Score. The only place the point of view flips. */
export function toScore(internal: number, stm: Color): Score {
  if (isMateScore(internal)) {
    const plies = MATE - Math.abs(internal);
    const moverWins = internal > 0;
    const winner = (stm === WHITE) === moverWins ? 'w' : 'b';
    return { kind: 'mate', winner, moves: Math.ceil(plies / 2) };
  }
  // `|| 0` turns negamax's -0 into 0, so a draw never formats as "-0.00".
  return { kind: 'cp', cp: (stm === BLACK ? -internal : internal) || 0 };
}
