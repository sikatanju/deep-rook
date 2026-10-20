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

/**
 * How a score reads on screen: one decimal with a sign ("+1.4", "-0.6", "0.0"),
 * "M2" when White mates in 2, "-M2" when Black does, "#" for mate on the board.
 * Never raw centipawns.
 */
export function formatScore(score: Score): string {
  if (score.kind === 'mate') {
    if (score.moves === 0) return '#';
    return score.winner === 'w' ? `M${score.moves}` : `-M${score.moves}`;
  }
  const pawns = Math.round(score.cp / 10) / 10;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

/**
 * White's winning chances, 0..100, on Lichess's logistic curve. Mate is 100
 * or 0. Drives the eval bar.
 */
export function winPercent(score: Score): number {
  if (score.kind === 'mate') return score.winner === 'w' ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.cp)) - 1);
}
