// Which part of the game a position belongs to. An approximation, like the
// accuracy curve: good enough to say where in a game mistakes cluster, not a
// verdict on any one position.

export const STAGES = {
  opening: { label: 'Opening' },
  middlegame: { label: 'Middlegame' },
  endgame: { label: 'Endgame' },
} as const;

export type Stage = keyof typeof STAGES;

/** Plies of theory and development before the middlegame begins. */
const OPENING_PLIES = 20;
/** At or below this many knights, bishops, rooks and queens in total, it is an endgame. */
const ENDGAME_PIECES = 6;

/**
 * `ply` is how many plies have been played to reach `fen` (0 for the start).
 * Endgame wins over the ply count: a queen trade on move 8 still ends the
 * middlegame early.
 */
export function stageAt(fen: string, ply: number): Stage {
  const board = fen.split(' ')[0]!;
  const pieces = board.match(/[nbrq]/gi)?.length ?? 0;
  if (pieces <= ENDGAME_PIECES) return 'endgame';
  return ply < OPENING_PLIES ? 'opening' : 'middlegame';
}
