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

/** One line from the root: its score and its UCI moves ("e2e4", "a7a8q"). */
export type Variation = { score: Score; pv: readonly string[] };

/**
 * One completed search iteration. `pv[0]` is the best move; `pv` is empty
 * only when the position has no legal moves.
 * `second` is the best line whose first move differs from `pv[0]`, searched
 * to the same depth. It never scores better for the side to move than the
 * best line. Absent when the root has fewer than two legal moves; readers
 * treat a missing second line as unknown.
 */
export type Line = Variation & {
  depth: number;
  second?: Variation;
  /**
   * Set when the search stopped on the time or node cap before the depth it
   * was asked for. Absent when that depth was reached or a mate was proved.
   * The engine leaves it unset; the analyzer writes it from the stop reason.
   */
  capped?: 'time' | 'nodes';
};

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
