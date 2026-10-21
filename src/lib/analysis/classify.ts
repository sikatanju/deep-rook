// Move grades from the analysis document. A move's grade compares the engine
// line before it with the line after it, as win chances lost by the mover
// (Chess.com's expected-points bands). Only settled positions are graded, so
// a grade never flips while the engine is still deepening.

import { Chess } from 'chess.js';

import { fenAt, materialOf, type Ply, type Replay } from '@/lib/chess/replay';
import { winPercent, type Variation } from '@/lib/chess/score';

import type { PositionAnalysis } from './game-analysis';

// `color` is a design-system token, so a grade looks the same in every palette
// and in places that cannot take a class (an SVG attribute).
export const CLASSIFICATIONS = {
  brilliant: {
    label: 'Brilliant',
    symbol: '!!',
    color: 'var(--grade-brilliant)',
  },
  great: { label: 'Great', symbol: '!', color: 'var(--grade-great)' },
  best: { label: 'Best', symbol: '★', color: 'var(--grade-best)' },
  excellent: {
    label: 'Excellent',
    symbol: '+',
    color: 'var(--grade-excellent)',
  },
  good: { label: 'Good', symbol: '✓', color: 'var(--grade-good)' },
  inaccuracy: {
    label: 'Inaccuracy',
    symbol: '?!',
    color: 'var(--grade-inaccuracy)',
  },
  mistake: { label: 'Mistake', symbol: '?', color: 'var(--grade-mistake)' },
  miss: { label: 'Miss', symbol: '✕', color: 'var(--grade-miss)' },
  blunder: { label: 'Blunder', symbol: '??', color: 'var(--grade-blunder)' },
} as const;

export type Classification = keyof typeof CLASSIFICATIONS;

/** Upper bounds of win-chance loss, in percentage points. */
const BY_LOSS: [number, Classification][] = [
  [2, 'excellent'],
  [5, 'good'],
  [10, 'inaccuracy'],
  [20, 'mistake'],
  [Infinity, 'blunder'],
];

/**
 * A best move is an only-move when the engine's next best line leaves the
 * mover this many points of win chance worse.
 */
const ONLY_MOVE_GAP = 15;

/**
 * One grade per ply; null while either side of the move is unsettled.
 *
 * - best: the engine's own move. great: best, and it either punishes the
 *   opponent's mistake or is an only-move (the next best line trails by
 *   ONLY_MOVE_GAP or more). A mate score for either side stays best, or
 *   every move of a mating attack would read as great, and so does a plain
 *   recapture. Without a second
 *   line, only punishing counts.
 * - brilliant: near-best, gives up 2+ points of material to the engine's
 *   reply, and leaves the mover not worse.
 * - miss: an inaccuracy or mistake right after the opponent's mistake.
 */
export function classifyMoves(
  replay: Replay,
  positions: readonly PositionAnalysis[],
): (Classification | null)[] {
  const lines = positions.map((p) => (p.status === 'done' ? p.line : null));
  const moves = replay.plies.map((ply, p) => {
    const before = lines[p];
    const after = lines[p + 1];
    if (!before || !after) return null;
    const fen = fenAt(replay, p);
    const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
    const win = (v: Variation) => 50 + sign * (winPercent(v.score) - 50);
    return {
      fen,
      ply,
      sign,
      reply: after.pv[0],
      loss: Math.max(0, win(before) - win(after)),
      winAfter: win(after),
      best: isPlayed(ply, before.pv[0]),
      onlyMove:
        !isRecapture(ply, replay.plies[p - 1]) &&
        before.score.kind !== 'mate' &&
        before.second !== undefined &&
        win(before) - win(before.second) >= ONLY_MOVE_GAP,
    };
  });

  return moves.map((m, p) => {
    if (!m) return null;
    const punishes = (moves[p - 1]?.loss ?? 0) >= 10;
    if (m.loss < 2 && m.winAfter >= 50 && isSacrifice(m)) return 'brilliant';
    if (m.best) return punishes || m.onlyMove ? 'great' : 'best';
    const kind = BY_LOSS.find(([max]) => m.loss < max)![1];
    return punishes && (kind === 'inaccuracy' || kind === 'mistake')
      ? 'miss'
      : kind;
  });
}

/** Taking back on the square the opponent just captured on: forced by nature, not a find. */
function isRecapture(ply: Ply, previous: Ply | undefined) {
  return (
    previous !== undefined &&
    previous.to === ply.to &&
    ply.san.includes('x') &&
    previous.san.includes('x')
  );
}

function isPlayed(ply: Ply, uci: string | undefined) {
  return (
    uci?.slice(0, 4) === ply.from + ply.to &&
    (uci.length < 5 || ply.san.includes(`=${uci[4]!.toUpperCase()}`))
  );
}

/** The engine's reply leaves the mover 2+ points down on material versus before the move. */
function isSacrifice({
  fen,
  ply,
  sign,
  reply,
}: {
  fen: string;
  ply: Ply;
  sign: number;
  reply: string | undefined;
}) {
  if (!reply) return false;
  const chess = new Chess(ply.fen);
  try {
    chess.move({
      from: reply.slice(0, 2),
      to: reply.slice(2, 4),
      promotion: reply[4],
    });
  } catch {
    return false;
  }
  const lost = materialOf(fen).balance - materialOf(chess.fen()).balance;
  return sign * lost >= 2;
}
