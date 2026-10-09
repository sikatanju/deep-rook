// Move grades from the analysis document. A move's grade compares the engine
// line before it with the line after it, as win chances lost by the mover
// (Chess.com's expected-points bands). Only settled positions are graded, so
// a grade never flips while the engine is still deepening.

import { Chess } from 'chess.js';

import { fenAt, materialOf, type Ply, type Replay } from '@/lib/chess/replay';
import { winPercent, type Line } from '@/lib/chess/score';

import type { PositionAnalysis } from './game-analysis';

export const CLASSIFICATIONS = {
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#1baca6' },
  great: { label: 'Great', symbol: '!', color: '#5c8bb0' },
  best: { label: 'Best', symbol: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', symbol: '✓', color: '#96bc4b' },
  good: { label: 'Good', symbol: '✓', color: '#96af8b' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#e6b422' },
  mistake: { label: 'Mistake', symbol: '?', color: '#ffa459' },
  miss: { label: 'Miss', symbol: '✗', color: '#ff7769' },
  blunder: { label: 'Blunder', symbol: '??', color: '#fa412d' },
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
 * One grade per ply; null while either side of the move is unsettled.
 *
 * - best: the engine's own move. great: best, and it punishes the opponent's
 *   mistake. brilliant: near-best, gives up 2+ points of material to the
 *   engine's reply, and leaves the mover not worse.
 * - miss: an inaccuracy or mistake right after the opponent's mistake.
 *
 * ponytail: no MultiPV, so "great" cannot detect only-moves; add when the
 * engine reports a second line.
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
    const win = (l: Line) => 50 + sign * (winPercent(l.score) - 50);
    return {
      fen,
      ply,
      sign,
      reply: after.pv[0],
      loss: Math.max(0, win(before) - win(after)),
      winAfter: win(after),
      best: isPlayed(ply, before.pv[0]),
    };
  });

  return moves.map((m, p) => {
    if (!m) return null;
    const punishes = (moves[p - 1]?.loss ?? 0) >= 10;
    if (m.loss < 2 && m.winAfter >= 50 && isSacrifice(m)) return 'brilliant';
    if (m.best) return punishes ? 'great' : 'best';
    const kind = BY_LOSS.find(([max]) => m.loss < max)![1];
    return punishes && (kind === 'inaccuracy' || kind === 'mistake')
      ? 'miss'
      : kind;
  });
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
