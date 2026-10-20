// What a month of games says about the player's sessions: who won, which games
// belong to the same day, and whether the latest day is going badly. Pure, so
// the Games page only has to draw it.

import type { Game } from './types';

export type Outcome = 'win' | 'loss' | 'draw';

/** One game from `username`'s side. Unknown usernames read as Black. */
export function outcomeFor(game: Game, username: string) {
  const white = game.white.username.toLowerCase() === username.toLowerCase();
  const me = white ? game.white : game.black;
  const opponent = white ? game.black : game.white;
  const outcome: Outcome =
    me.result === 'win' ? 'win' : opponent.result === 'win' ? 'loss' : 'draw';
  return { white, me, opponent, outcome };
}

export type DayGroup = {
  /** Local calendar day, `YYYY-MM-DD`. */
  key: string;
  /** Any moment of that day, for formatting. */
  date: Date;
  /** In the order given. */
  games: Game[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Splits games by local calendar day. The input order is kept, both across
 * groups and inside each, so newest-first in means newest-first out.
 */
export function groupByDay(games: readonly Game[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const game of games) {
    const d = game.endedAt;
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const group = groups.get(key);
    if (group) group.games.push(game);
    else groups.set(key, { key, date: d, games: [game] });
  }
  return [...groups.values()];
}

/** The fewest straight losses worth a word of comfort. */
export const STREAK_MIN = 3;

/**
 * Straight losses at the end of the latest day, from `games` newest first;
 * null below STREAK_MIN. `last` is the most recent loss.
 */
export function losingStreak(
  games: readonly Game[],
  username: string,
): { count: number; last: Game } | null {
  const latest = groupByDay(games)[0];
  if (!latest) return null;
  let count = 0;
  for (const game of latest.games) {
    if (outcomeFor(game, username).outcome !== 'loss') break;
    count++;
  }
  return count >= STREAK_MIN ? { count, last: latest.games[0]! } : null;
}
