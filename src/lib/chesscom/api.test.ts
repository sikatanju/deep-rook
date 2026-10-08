import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { fetchArchives, fetchMonth, fetchProfile } from './api';
import { ChessComError } from './errors';
import { toUsername } from './types';

const user = toUsername('  HiKaRu ');

function game(over: Record<string, unknown> = {}) {
  return {
    url: 'https://www.chess.com/game/live/1',
    pgn: '1. e4 e5',
    end_time: 1735949652,
    time_control: '180',
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    white: { username: 'A', rating: 1500, result: 'win' },
    black: { username: 'B', rating: 1490, result: 'resigned' },
    ...over,
  };
}

function reply(status: number, body: unknown = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  });
}

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
  return e instanceof ChessComError ? e.kind : e;
}

test('toUsername trims and lowercases', () => {
  expect(user).toBe('hikaru');
});

test('fetchProfile parses and hits the lowercase URL with no custom headers', async () => {
  fetchMock.mockResolvedValueOnce(
    reply(200, { username: 'Hikaru', joined: 1389043258, title: 'GM' }),
  );
  const p = await fetchProfile(user);
  expect(p).toMatchObject({ username: 'Hikaru', title: 'GM' });
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    'https://api.chess.com/pub/player/hikaru',
  );
  expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal: undefined });
});

test('profile 404 is not-found', async () => {
  fetchMock.mockResolvedValueOnce(reply(404));
  expect(await kindOf(fetchProfile(user))).toBe('not-found');
});

test('fetchArchives returns newest month first', async () => {
  fetchMock.mockResolvedValueOnce(
    reply(200, {
      archives: [
        'https://api.chess.com/pub/player/hikaru/games/2024/12',
        'https://api.chess.com/pub/player/hikaru/games/2025/01',
      ],
    }),
  );
  expect(await fetchArchives(user)).toEqual(['2025-01', '2024-12']);
});

test('fetchMonth keeps standard chess, drops variants and malformed games, sorts newest first', async () => {
  fetchMock.mockResolvedValueOnce(
    reply(200, {
      games: [
        game({ url: 'old', end_time: 100 }),
        game({
          url: 'new',
          end_time: 200,
          accuracies: { white: 90, black: 80 },
        }),
        game({ url: 'variant', rules: 'chess960' }),
        game({ url: 'broken', time_class: 'weird' }),
        game({ url: 'noacc', white: { username: 'A' } }),
      ],
    }),
  );
  const games = await fetchMonth(user, '2025-01');
  expect(games.map((g) => g.id)).toEqual(['new', 'old']);
  expect(games[0]?.accuracies).toEqual({ white: 90, black: 80 });
  expect(games[1]?.accuracies).toBeUndefined();
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    'https://api.chess.com/pub/player/hikaru/games/2025/01',
  );
});

test('month 404 is no-games and 410 is gone', async () => {
  fetchMock.mockResolvedValueOnce(reply(404)).mockResolvedValueOnce(reply(410));
  expect(await kindOf(fetchMonth(user, '2030-01'))).toBe('no-games');
  expect(await kindOf(fetchMonth(user, '2030-01'))).toBe('gone');
});

test('a non-JSON body is bad-shape and a fetch failure is network', async () => {
  fetchMock
    .mockResolvedValueOnce(reply(200, '<html>Just a moment...</html>'))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect(await kindOf(fetchProfile(user))).toBe('bad-shape');
  expect(await kindOf(fetchProfile(user))).toBe('network');
});

test('429 is retried with backoff and then succeeds', async () => {
  vi.useFakeTimers();
  fetchMock
    .mockResolvedValueOnce(reply(429))
    .mockResolvedValueOnce(reply(200, { archives: [] }));
  const p = fetchArchives(user);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await p).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('persistent 429 surfaces rate-limited after two retries', async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(() => Promise.resolve(reply(429)));
  const p = kindOf(fetchProfile(user));
  await vi.advanceTimersByTimeAsync(3000);
  expect(await p).toBe('rate-limited');
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('requests run one at a time', async () => {
  let inFlight = 0;
  let peak = 0;
  fetchMock.mockImplementation(async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return reply(200, { archives: [] });
  });
  await Promise.all([
    fetchArchives(user),
    fetchArchives(user),
    fetchArchives(user),
  ]);
  expect(peak).toBe(1);
});

test('an aborted request rejects with the abort reason, not a ChessComError', async () => {
  const ctl = new AbortController();
  ctl.abort();
  const e = await fetchProfile(user, ctl.signal).catch((err: unknown) => err);
  expect(e).not.toBeInstanceOf(ChessComError);
  expect(fetchMock).not.toHaveBeenCalled();
});
