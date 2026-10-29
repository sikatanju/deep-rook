import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { Game, Site } from '@/lib/chesscom/types';

import {
  checkNewGames,
  fetchRecent,
  readLastCheck,
  recordFirstCheck,
  sinceText,
  summarize,
  writeLastCheck,
  type Recent,
} from './new-games';

const NOW = new Date(2026, 9, 29, 15, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function game(
  id: string,
  endedAt: number,
  result: 'win' | 'loss' | 'draw' = 'win',
  site: Site = 'chesscom',
): Game {
  return {
    id,
    site,
    url: `https://example.test/${id}`,
    pgn: '1. e4 e5 *',
    endedAt: new Date(endedAt),
    timeControl: '180',
    timeClass: 'blitz',
    rated: true,
    white: { username: 'Me', rating: 1500, result },
    black: {
      username: 'Rival',
      rating: 1500,
      result:
        result === 'win' ? 'resigned' : result === 'loss' ? 'win' : result,
    },
  };
}

beforeEach(() => localStorage.clear());

const names = [{ site: 'chesscom' as const, username: 'Me' }];

test('keeps the last check per site and username, ignoring case', () => {
  expect(readLastCheck('chesscom', 'Me')).toBeNull();
  writeLastCheck('chesscom', 'Me', 5);
  expect(readLastCheck('chesscom', ' me ')).toBe(5);
  expect(readLastCheck('lichess', 'me')).toBeNull();
  recordFirstCheck('chesscom', 'me', 9);
  expect(readLastCheck('chesscom', 'me')).toBe(5);
  recordFirstCheck('lichess', 'me', 9);
  expect(readLastCheck('lichess', 'me')).toBe(9);
});

test('games that ended after the last check are new, and losses are counted', async () => {
  writeLastCheck('chesscom', 'Me', NOW - DAY);
  const fetchRecent = vi
    .fn<Recent>()
    .mockResolvedValue([
      game('a', NOW - HOUR, 'loss'),
      game('b', NOW - 2 * HOUR, 'win'),
      game('c', NOW - 3 * HOUR, 'loss'),
      game('d', NOW - 4 * HOUR, 'draw'),
      game('old', NOW - DAY - HOUR, 'loss'),
      game('edge', NOW - DAY, 'loss'),
    ]);
  const checks = await checkNewGames({ names, now: NOW, fetchRecent });
  expect(checks).toHaveLength(1);
  expect(checks[0]!.games.map((g) => g.id)).toEqual(['a', 'b', 'c', 'd']);
  expect(summarize(checks)).toMatchObject({
    count: 4,
    losses: 2,
    since: NOW - DAY,
  });
  // Found games do not advance the check; only seeing them does.
  expect(readLastCheck('chesscom', 'Me')).toBe(NOW - DAY);
  expect(fetchRecent).toHaveBeenCalledWith(
    'chesscom',
    'Me',
    NOW - DAY,
    NOW,
    undefined,
  );
});

test('nothing new says nothing and moves the check to now', async () => {
  writeLastCheck('chesscom', 'Me', NOW - DAY);
  const fetchRecent = vi
    .fn<Recent>()
    .mockResolvedValue([game('old', NOW - DAY - HOUR)]);
  const checks = await checkNewGames({ names, now: NOW, fetchRecent });
  expect(checks).toEqual([]);
  expect(readLastCheck('chesscom', 'Me')).toBe(NOW);
});

test('the first run only records the time, without fetching', async () => {
  const fetchRecent = vi.fn<Recent>();
  const checks = await checkNewGames({ names, now: NOW, fetchRecent });
  expect(checks).toEqual([]);
  expect(fetchRecent).not.toHaveBeenCalled();
  expect(readLastCheck('chesscom', 'Me')).toBe(NOW);
});

test('a failed fetch is silent and leaves the check alone', async () => {
  writeLastCheck('chesscom', 'Me', NOW - DAY);
  const fetchRecent = vi.fn<Recent>().mockRejectedValue(new Error('offline'));
  await expect(
    checkNewGames({ names, now: NOW, fetchRecent }),
  ).resolves.toEqual([]);
  expect(readLastCheck('chesscom', 'Me')).toBe(NOW - DAY);
});

test('one site failing does not hide the other, and each is fetched once', async () => {
  writeLastCheck('chesscom', 'Me', NOW - DAY);
  writeLastCheck('lichess', 'me2', NOW - 2 * DAY);
  const fetchRecent = vi.fn<Recent>(async (site) => {
    if (site === 'chesscom') throw new Error('down');
    return [game('l1', NOW - HOUR, 'loss', 'lichess')];
  });
  const checks = await checkNewGames({
    names: [...names, { site: 'lichess', username: 'me2' }],
    now: NOW,
    fetchRecent,
  });
  expect(fetchRecent).toHaveBeenCalledTimes(2);
  expect(checks.map((c) => c.site)).toEqual(['lichess']);
  expect(summarize(checks)?.since).toBe(NOW - 2 * DAY);
});

test('summarize is null with no new games', () => {
  expect(summarize([])).toBeNull();
});

test('sinceText names the day, or the clock time when it was today', () => {
  expect(sinceText(NOW - DAY, NOW)).toBe('yesterday');
  expect(sinceText(NOW - 3 * DAY, NOW)).toBe('3 days ago');
  expect(sinceText(new Date(2026, 9, 29, 9, 5).getTime(), NOW)).toMatch(/9:05/);
});

// fetchRecent against the site APIs.
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const month = (end: number) => ({
  url: 'https://www.chess.com/game/live/1',
  pgn: '1. e4 e5',
  end_time: Math.floor(end / 1000),
  time_control: '180',
  time_class: 'blitz',
  rules: 'chess',
  rated: true,
  white: { username: 'A', rating: 1500, result: 'win' },
  black: { username: 'B', rating: 1490, result: 'resigned' },
});
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

test('Chess.com: one request for the current month', async () => {
  const now = Date.UTC(2026, 9, 29, 12);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ games: [month(now - HOUR)] })),
  );
  const games = await fetchRecent('chesscom', 'Me', now - DAY, now);
  expect(games).toHaveLength(1);
  expect(urls()).toEqual(['https://api.chess.com/pub/player/me/games/2026/10']);
});

test('Chess.com: also the month before when the last check was before this month', async () => {
  const now = Date.UTC(2026, 10, 1, 8);
  fetchMock.mockImplementation((url) =>
    Promise.resolve(
      String(url).endsWith('/2026/10')
        ? new Response(JSON.stringify({ games: [month(now - 3 * HOUR)] }))
        : new Response('{}', { status: 404 }),
    ),
  );
  const games = await fetchRecent('chesscom', 'Me', now - 10 * HOUR, now);
  expect(urls()).toEqual([
    'https://api.chess.com/pub/player/me/games/2026/11',
    'https://api.chess.com/pub/player/me/games/2026/10',
  ]);
  expect(games).toHaveLength(1);
});

test('Lichess: one request, from a margin before the last check', async () => {
  fetchMock.mockResolvedValue(new Response(''));
  await fetchRecent('lichess', 'Me', NOW - DAY, NOW);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const url = new URL(urls()[0]!);
  expect(url.pathname).toBe('/api/games/user/me');
  expect(Number(url.searchParams.get('since'))).toBeLessThan(NOW - DAY);
});
