// Hints for a drill, in two steps: the square of the piece to move, then a
// nudge about the theme of the engine's line. Neither names the move. Pure.

import { Chess, type Color, type Square } from 'chess.js';

import type { Variation } from '@/lib/chess/score';

import type { Drill } from './drill';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 } as const;

/** Win this much material, net, over the line to call it winning material. */
const MATERIAL_WON = 2;
/** Plies of the line read: the user's move and the reply, twice over. */
const PLIES = 4;

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

function material(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board())
    for (const piece of row)
      if (piece && piece.type !== 'k')
        sum += (piece.color === color ? 1 : -1) * VALUE[piece.type];
  return sum;
}

/** The piece that just moved to `square` attacks two pieces it wins one of. */
function forks(chess: Chess, square: Square, color: Color): boolean {
  const mover = chess.get(square);
  if (!mover || mover.type === 'k') return false;
  const targets = chess
    .board()
    .flat()
    .filter(
      (piece) =>
        piece !== null &&
        piece.color !== color &&
        piece.type !== 'p' &&
        chess.attackers(piece.square, color).includes(square) &&
        (VALUE[piece.type] > VALUE[mover.type] ||
          chess.attackers(piece.square, other(color)).length === 0),
    );
  return targets.length >= 2;
}

/**
 * A nudge toward what `line` (the engine's, from `fen`, for `color`) is
 * about; null when it shows no theme worth naming.
 */
export function themeOf(
  fen: string,
  line: Variation,
  color: Color,
): string | null {
  const { score } = line;
  if (score.kind === 'mate' && score.winner === color)
    return `There is mate in ${score.moves}.`;

  const chess = new Chess(fen);
  const start = material(chess, color);
  let fork = false;
  for (const [i, uci] of line.pv.slice(0, PLIES).entries()) {
    try {
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
    } catch {
      break;
    }
    if (i === 0) fork = forks(chess, uci.slice(2, 4) as Square, color);
  }
  if (fork) return 'Look for a fork.';
  return material(chess, color) - start >= MATERIAL_WON
    ? 'There is material to win.'
    : null;
}

export type Hint = {
  /** The square of the piece to move. */
  from: string;
  /** The theme nudge; null when the line shows none. */
  theme: string | null;
};

export function hintOf(drill: Drill): Hint {
  const line = drill.record.lines[drill.index - 1]!;
  return {
    from: drill.best.uci.slice(0, 2),
    theme: themeOf(drill.fen, line, drill.color),
  };
}

/** How many hints a drill offers: the square, plus the theme if there is one. */
export const hintsIn = (hint: Hint) => (hint.theme ? 2 : 1);
