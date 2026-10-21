import type { Game } from '@/lib/chesscom/types';
import { serialQueue, sleep } from '@/lib/serial';

import { LichessError } from './errors';
import { parseGames } from './parse';
import type { LichessUsername } from './types';

const BASE = 'https://lichess.org/api/games/user';
export const PAGE_SIZE = 30;
const PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';
const MAX_RETRIES = 1;
// Lichess asks clients to wait a full minute after a 429.
const BACKOFF_MS = 60_000;

// Lichess asks for one request at a time per IP. `Accept` is a CORS-safelisted
// header, so asking for NDJSON costs no preflight.
const enqueue = serialQueue();

async function getText(url: string, signal?: AbortSignal): Promise<string> {
  return enqueue(async () => {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/x-ndjson' },
          signal,
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new LichessError('network');
      }
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS, signal);
        continue;
      }
      if (res.status === 429) throw new LichessError('rate-limited');
      if (res.status === 404) throw new LichessError('not-found');
      if (res.status === 410) throw new LichessError('gone');
      if (!res.ok) throw new LichessError('network');
      try {
        return await res.text();
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new LichessError('network');
      }
    }
  });
}

export type GamesPage = {
  /** Newest first. */
  games: Game[];
  /** Pass as `until` for the next, older page; null at the end of the history. */
  next: number | null;
};

/**
 * One page of `user`'s standard games, newest first. `until` is a `next` from
 * an earlier page. Pages count dropped games too, so one can hold fewer than
 * PAGE_SIZE games and still have more behind it.
 */
export async function fetchGames(
  user: LichessUsername,
  { until, signal }: { until?: number; signal?: AbortSignal } = {},
): Promise<GamesPage> {
  const params = new URLSearchParams({
    max: String(PAGE_SIZE),
    pgnInJson: 'true',
    clocks: 'true',
    opening: 'true',
    perfType: PERF_TYPES,
  });
  if (until !== undefined) params.set('until', String(until));
  const page = parseGames(
    await getText(`${BASE}/${encodeURIComponent(user)}?${params}`, signal),
  );
  return {
    games: page.games,
    next: page.lines >= PAGE_SIZE ? page.oldestCreatedAt : null,
  };
}
