// Which of the listed games a batch review takes: the latest N, or the latest N
// the player lost. Pure, so the panel only has to draw it.

import { outcomeFor } from '@/lib/chesscom/session';
import type { Game } from '@/lib/chesscom/types';

import { sideOf } from './overview';

/**
 * Whether the player lost `game`, judged by the result of the side one of
 * `names` (see `sideOf`) played. A draw is not a loss, and a game none of the
 * names played, or both sides did, is nobody's.
 */
export function isLoss(game: Game, names: readonly string[]): boolean {
  const side = sideOf(
    { White: game.white.username, Black: game.black.username },
    names,
  );
  if (side === null) return false;
  const mine = side === 'w' ? game.white : game.black;
  return outcomeFor(game, mine.username).outcome === 'loss';
}

/**
 * The first `count` of `listed` (newest first), or of its losses when
 * `lossesOnly`. `losses` is how many losses it found there, null when not
 * filtering; fewer than `count` means the listed games ran out.
 */
export function pickBatch(
  listed: readonly Game[],
  count: number,
  lossesOnly: boolean,
  names: readonly string[],
): { games: Game[]; losses: number | null } {
  if (!lossesOnly) return { games: listed.slice(0, count), losses: null };
  const games = listed.filter((g) => isLoss(g, names)).slice(0, count);
  return { games, losses: games.length };
}
