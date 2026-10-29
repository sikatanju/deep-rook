// What a player has played since they last looked: a quiet check of each saved
// username's recent games, run once when the app opens. The last check is kept
// per site and username in local storage. Nothing here throws at the caller: a
// fetch that fails just finds nothing.

import { fetchMonth } from '@/lib/chesscom/api';
import { ChessComError } from '@/lib/chesscom/errors';
import { outcomeFor } from '@/lib/chesscom/session';
import {
  toUsername,
  type Game,
  type MonthKey,
  type Site,
} from '@/lib/chesscom/types';
import { fetchGames } from '@/lib/lichess/api';
import { toLichessUsername } from '@/lib/lichess/types';

const key = (site: Site, username: string) =>
  `lastCheck:${site}:${username.trim().toLowerCase()}`;

/** When `username` on `site` was last checked, in ms; null if never. */
export function readLastCheck(site: Site, username: string): number | null {
  try {
    const raw = localStorage.getItem(key(site, username));
    const at = raw === null ? NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export function writeLastCheck(site: Site, username: string, at: number) {
  try {
    localStorage.setItem(key(site, username), String(at));
  } catch {
    // Storage blocked: the banner may come back, nothing worse.
  }
}

/** Starts the clock for a username never checked; leaves an existing one. */
export function recordFirstCheck(site: Site, username: string, at: number) {
  if (readLastCheck(site, username) === null)
    writeLastCheck(site, username, at);
}

/** Fetches `username`'s recent games on `site`, newest first. */
export type Recent = (
  site: Site,
  username: string,
  since: number,
  now: number,
  signal?: AbortSignal,
) => Promise<Game[]>;

/** The UTC month `at` falls in, `back` months ago: Chess.com files games by it. */
const monthKey = (at: number, back = 0): MonthKey => {
  const d = new Date(at);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Lichess's `since` filters on when a game was created, not when it ended, so
 * it starts a little earlier and `checkNewGames` filters by end time.
 */
const CREATED_MARGIN = 12 * 3_600_000;

/**
 * Lichess is one request. Chess.com is one request in the usual case and at most
 * two: the current month, plus the month before when the last check was before
 * this month, so a visit on the 1st still sees last night's games. A gap longer
 * than the previous month is not covered: games from older months are not
 * offered. A month with no games yet is empty, not an error.
 */
export const fetchRecent: Recent = async (
  site,
  username,
  since,
  now,
  signal,
) => {
  if (site === 'lichess') {
    const page = await fetchGames(toLichessUsername(username), {
      since: since - CREATED_MARGIN,
      signal,
    });
    return page.games;
  }
  const months = [monthKey(now)];
  if (monthKey(since) !== months[0]) months.push(monthKey(now, 1));
  const games: Game[] = [];
  for (const month of months) {
    try {
      games.push(...(await fetchMonth(toUsername(username), month, signal)));
    } catch (e) {
      if (!(e instanceof ChessComError && e.kind === 'no-games')) throw e;
    }
  }
  return games.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
};

/** One site's username and its games that ended after `since`. */
export type SiteCheck = {
  site: Site;
  username: string;
  /** The last check these are new since. */
  since: number;
  /** Newest first. */
  games: Game[];
};

/**
 * Checks each username once. A username never checked only has its time
 * recorded; the first run finds nothing by design. One with no new games moves
 * its check to `now`. One with new games keeps its check until `markSeen`, so
 * ignoring the banner does not lose them. A failed fetch is skipped.
 */
export async function checkNewGames({
  names,
  now,
  signal,
  fetchRecent: fetchGamesFor = fetchRecent,
}: {
  names: readonly { site: Site; username: string }[];
  now: number;
  signal?: AbortSignal;
  fetchRecent?: Recent;
}): Promise<SiteCheck[]> {
  const checks = await Promise.all(
    names.map(async ({ site, username }): Promise<SiteCheck | null> => {
      const since = readLastCheck(site, username);
      if (since === null) {
        writeLastCheck(site, username, now);
        return null;
      }
      try {
        const recent = await fetchGamesFor(site, username, since, now, signal);
        const games = recent.filter((g) => g.endedAt.getTime() > since);
        if (games.length === 0) {
          writeLastCheck(site, username, now);
          return null;
        }
        return { site, username, since, games };
      } catch {
        return null;
      }
    }),
  );
  return checks.filter((c): c is SiteCheck => c !== null);
}

/** Marks every found game seen: the next check starts from `now`. */
export function markSeen(checks: readonly SiteCheck[], now: number) {
  for (const { site, username } of checks) writeLastCheck(site, username, now);
}

export type NewGames = {
  games: Game[];
  count: number;
  losses: number;
  /** The oldest of the checks the games are new since, in ms. */
  since: number;
};

/** The new games across sites, or null when there are none. */
export function summarize(checks: readonly SiteCheck[]): NewGames | null {
  if (checks.length === 0) return null;
  const games = checks
    .flatMap((c) => c.games)
    .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
  const losses = checks.reduce(
    (n, c) =>
      n +
      c.games.filter((g) => outcomeFor(g, c.username).outcome === 'loss')
        .length,
    0,
  );
  return {
    games,
    count: games.length,
    losses,
    since: Math.min(...checks.map((c) => c.since)),
  };
}

const clock = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

/** "yesterday", "3 days ago", or the clock time when it was today. */
export function sinceText(since: number, now: number): string {
  const day = (at: number) => {
    const d = new Date(at);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.round((day(now) - day(since)) / 86_400_000);
  if (days <= 0) return clock.format(since);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
