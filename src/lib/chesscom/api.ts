import { ChessComError, type ChessComErrorKind } from './errors';
import { parseArchives, parseMonth, parseProfile } from './parse';
import type { Game, MonthKey, Profile, Username } from './types';

const BASE = 'https://api.chess.com/pub/player';
const MAX_RETRIES = 2;
const BACKOFF_MS = 1000;

// Chess.com only promises no rate limiting for serial requests, so every call
// waits for the previous one. No custom headers either: the API's CORS preflight
// allows only `Origin`, and the browser HTTP cache handles ETags on its own.
let tail: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function getJson(
  url: string,
  notFound: ChessComErrorKind,
  signal?: AbortSignal,
): Promise<unknown> {
  return enqueue(async () => {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      let res: Response;
      try {
        res = await fetch(url, { signal });
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new ChessComError('network');
      }
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS * 2 ** attempt, signal);
        continue;
      }
      if (res.status === 429) throw new ChessComError('rate-limited');
      if (res.status === 404) throw new ChessComError(notFound);
      if (res.status === 410) throw new ChessComError('gone');
      if (!res.ok) throw new ChessComError('network');
      try {
        return await res.json();
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new ChessComError('bad-shape');
      }
    }
  });
}

export async function fetchProfile(
  user: Username,
  signal?: AbortSignal,
): Promise<Profile> {
  return parseProfile(await getJson(`${BASE}/${user}`, 'not-found', signal));
}

// Newest month first.
export async function fetchArchives(
  user: Username,
  signal?: AbortSignal,
): Promise<MonthKey[]> {
  return parseArchives(
    await getJson(`${BASE}/${user}/games/archives`, 'not-found', signal),
  );
}

// Newest game first.
export async function fetchMonth(
  user: Username,
  month: MonthKey,
  signal?: AbortSignal,
): Promise<Game[]> {
  const [year, mm] = month.split('-');
  return parseMonth(
    await getJson(`${BASE}/${user}/games/${year}/${mm}`, 'no-games', signal),
  );
}
