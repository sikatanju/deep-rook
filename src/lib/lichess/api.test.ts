import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { fetchGames, PAGE_SIZE } from './api';
import { LichessError } from './errors';
import { BLITZ, DRAW, ndjson } from './fixtures';
import { toLichessUsername } from './types';

const user = toLichessUsername('  ThiBault ');

const reply = (status: number, body = '') => new Response(body, { status });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function kindOf(p: Promise<unknown>) {
  const e = await p.then(
    () => undefined,
    (err: unknown) => err,
  );
  return e instanceof LichessError ? e.kind : e;
}

function sentUrl(call = 0) {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

test('toLichessUsername trims and lowercases', () => {
  expect(user).toBe('thibault');
});

test('asks for one page of NDJSON with PGNs, clocks and openings', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, ndjson(BLITZ, DRAW)));
  const page = await fetchGames(user);
  expect(page.games.map((g) => g.id)).toEqual(['jiqHI3gX', 'sgLDzWna']);

  const url = sentUrl();
  expect(url.origin + url.pathname).toBe(
    'https://lichess.org/api/games/user/thibault',
  );
  expect(Object.fromEntries(url.searchParams)).toEqual({
    max: '30',
    pgnInJson: 'true',
    clocks: 'true',
    opening: 'true',
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
  });
  const init = fetchMock.mock.calls[0]?.[1];
  expect(new Headers(init?.headers).get('Accept')).toBe('application/x-ndjson');
});

test('a short page is the end of the history', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, ndjson(BLITZ, DRAW)));
  expect((await fetchGames(user)).next).toBeNull();
});

test('a full page points at the next one by the oldest createdAt', async () => {
  const lines = Array.from({ length: PAGE_SIZE }, (_, i) => ({
    ...BLITZ,
    id: `g${i}`,
    createdAt: 2000 - i,
    variant: i === PAGE_SIZE - 1 ? 'chess960' : 'standard',
  }));
  fetchMock
    .mockResolvedValueOnce(reply(200, ndjson(...lines)))
    .mockResolvedValueOnce(reply(200, ndjson(DRAW)));

  const first = await fetchGames(user);
  expect(first.games).toHaveLength(PAGE_SIZE - 1);
  expect(first.next).toBe(2000 - (PAGE_SIZE - 1));

  await fetchGames(user, { until: first.next! });
  expect(sentUrl(1).searchParams.get('until')).toBe(String(first.next));
});

test('an unknown player is not-found', async () => {
  fetchMock.mockResolvedValueOnce(reply(404, '{"error":"Not found"}'));
  expect(await kindOf(fetchGames(user))).toBe('not-found');
});

test('a fetch failure or a server error is network', async () => {
  fetchMock
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(reply(500));
  expect(await kindOf(fetchGames(user))).toBe('network');
  expect(await kindOf(fetchGames(user))).toBe('network');
});

test('429 waits the minute Lichess asks for, then retries', async () => {
  vi.useFakeTimers();
  fetchMock
    .mockResolvedValueOnce(reply(429))
    .mockResolvedValueOnce(reply(200, ndjson(BLITZ)));
  const p = fetchGames(user);
  await vi.advanceTimersByTimeAsync(59_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1_000);
  expect((await p).games).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a second 429 surfaces rate-limited', async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(() => Promise.resolve(reply(429)));
  const p = kindOf(fetchGames(user));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await p).toBe('rate-limited');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('requests run one at a time', async () => {
  let inFlight = 0;
  let peak = 0;
  fetchMock.mockImplementation(async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return reply(200, '');
  });
  await Promise.all([fetchGames(user), fetchGames(user), fetchGames(user)]);
  expect(peak).toBe(1);
});

test('an aborted request rejects with the abort reason, not a LichessError', async () => {
  const ctl = new AbortController();
  ctl.abort();
  const e = await fetchGames(user, { signal: ctl.signal }).catch(
    (err: unknown) => err,
  );
  expect(e).not.toBeInstanceOf(LichessError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('aborting during the 429 wait stops the retry', async () => {
  vi.useFakeTimers();
  fetchMock.mockResolvedValue(reply(429));
  const ctl = new AbortController();
  const p = fetchGames(user, { signal: ctl.signal }).catch(
    (err: unknown) => err,
  );
  await vi.advanceTimersByTimeAsync(1_000);
  ctl.abort();
  expect(await p).not.toBeInstanceOf(LichessError);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
