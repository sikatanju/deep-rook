// Engine output vocabulary, shared by the engine, the analysis document, and
// the UI. Structured-cloneable, so it crosses the worker boundary as is.

/**
 * An evaluation from White's view, same sign as `Material.balance`.
 * Mate names the winner instead of signing a count, so mate on the board
 * (`moves: 0`) is representable. `moves` counts the winner's moves to mate.
 */
export type Score =
  | { kind: 'cp'; cp: number }
  | { kind: 'mate'; winner: 'w' | 'b'; moves: number };

/**
 * One completed search iteration.
 * `pv` holds UCI moves ("e2e4", "a7a8q"); `pv[0]` is the best move. It is
 * empty only when the position has no legal moves.
 */
export type Line = { score: Score; pv: readonly string[]; depth: number };

/** "+1.24", "-0.30", "0.00", "#3" (White mates in 3), "#-2" (Black mates in 2), "#" for mate on the board. */
export function formatScore(score: Score): string {
  if (score.kind === 'mate') {
    if (score.moves === 0) return '#';
    return score.winner === 'w' ? `#${score.moves}` : `#-${score.moves}`;
  }
  const pawns = score.cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

/**
 * White's winning chances, 0..100, on Lichess's logistic curve. Mate is 100
 * or 0. Drives the eval bar.
 */
export function winPercent(score: Score): number {
  if (score.kind === 'mate') return score.winner === 'w' ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.cp)) - 1);
}
