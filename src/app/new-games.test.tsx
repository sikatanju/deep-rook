import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { stored } from '@/lib/analysis/fixtures';
import type { Job } from '@/lib/analysis/protocol';
import { parseReplay } from '@/lib/chess/replay';
import { readLastCheck } from '@/lib/new-games';

// Every search answers 0.00 at once.
vi.hoisted(() => {
  class ScriptedWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    private dead = false;
    postMessage({ jobId }: Job) {
      setTimeout(() => {
        if (this.dead) return;
        const line = { score: { kind: 'cp', cp: 0 }, pv: [], depth: 1 };
        this.onmessage?.({ data: { kind: 'done', jobId, outcome: { line } } });
      });
    }
    terminate() {
      this.dead = true;
    }
  }
  globalThis.Worker = ScriptedWorker as never;
});

import App from './App';

// Yesterday at noon, local: "since yesterday" whatever time the test runs.
const LAST = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  new Date().getDate() - 1,
  12,
).getTime();

beforeEach(() => {
  location.hash = '#/games';
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const MOVES: Record<number, string> = {
  1: '1. e4 e5 2. Nf3',
  2: '1. d4 d5 2. c4',
  3: '1. c4 e5 2. Nc3',
};
const link = (n: number) => `https://www.chess.com/game/live/${n}`;
const pgn = (n: number) =>
  `[White "Me"]\n[Black "Rival${n}"]\n[Link "${link(n)}"]\n\n${MOVES[n]} *`;

/** Game `n` ended `n` seconds ago, or at `endedAt`; lost unless `n` is 2. */
function monthGame(n: number, endedAt = Date.now() - n * 1000) {
  const win = n === 2;
  return {
    url: link(n),
    pgn: pgn(n),
    end_time: Math.floor(endedAt / 1000),
    time_control: '180',
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    white: { username: 'Me', rating: 1500, result: win ? 'win' : 'resigned' },
    black: {
      username: `Rival${n}`,
      rating: 1490,
      result: win ? 'resigned' : 'win',
    },
  };
}

/** Answers the current month's games with `games`, anything else with 404. */
function stubMonth(games: unknown[]) {
  const d = new Date();
  const path = `/games/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.endsWith(path)
        ? new Response(JSON.stringify({ games }))
        : new Response('{}', { status: 404 }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function visit(lastCheck: number | null = LAST) {
  localStorage.setItem('lastUsername', 'Me');
  if (lastCheck !== null)
    localStorage.setItem('lastCheck:chesscom:me', String(lastCheck));
}

const banner = () => screen.findByRole('region', { name: 'New games' });

test('offers the games played since the last visit, with the losses', async () => {
  visit();
  const fetchMock = stubMonth([
    monthGame(1),
    monthGame(2),
    monthGame(3),
    monthGame(3, LAST - 3_600_000),
  ]);
  render(<App store={null} />);
  expect(
    await screen.findByText(
      '3 new games since yesterday, 2 losses. Review them?',
    ),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  // Not seen yet: the next open would offer them again.
  expect(readLastCheck('chesscom', 'me')).toBe(LAST);
});

test('Review them runs the batch on exactly those games, skipping saved ones', async () => {
  visit();
  stubMonth([monthGame(1), monthGame(2), monthGame(3, LAST - 3_600_000)]);
  const store = memoryStore();
  await store.save(stored({ replay: parseReplay(pgn(1)) }));
  const user = userEvent.setup();
  render(<App store={store} />);
  await banner();
  const review = screen.getByRole('button', { name: 'Review them' });
  await waitFor(() => expect(review).toBeEnabled());
  await user.click(review);

  expect(
    await screen.findByText(
      'Reviewed 1 of 1 new games.',
      {},
      { timeout: 5_000 },
    ),
  ).toBeInTheDocument();
  // The saved game and the old one were left out; only game 2 was added.
  expect(await store.list()).toHaveLength(2);
  expect(readLastCheck('chesscom', 'me')).toBeGreaterThan(LAST);
});

test('dismissing marks the games seen, so the next open stays quiet', async () => {
  visit();
  stubMonth([monthGame(1)]);
  const user = userEvent.setup();
  const first = render(<App store={null} />);
  await banner();
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('region', { name: 'New games' })).toBeNull();
  expect(readLastCheck('chesscom', 'me')).toBeGreaterThan(LAST);
  first.unmount();

  // The same game, found again by the next open.
  const fetchMock = stubMonth([monthGame(1, Date.now() - 1000)]);
  localStorage.setItem('lastCheck:chesscom:me', String(Date.now() + 60_000));
  render(<App store={null} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('region', { name: 'New games' })).toBeNull();
});

test('no new games shows nothing', async () => {
  visit();
  const fetchMock = stubMonth([monthGame(1, LAST - 60_000)]);
  render(<App store={null} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(readLastCheck('chesscom', 'me')).toBeGreaterThan(LAST),
  );
  expect(screen.queryByRole('region', { name: 'New games' })).toBeNull();
});

test('the first run only records the time, and fetches nothing', async () => {
  visit(null);
  const fetchMock = stubMonth([monthGame(1)]);
  render(<App store={null} />);
  await waitFor(() => expect(readLastCheck('chesscom', 'me')).not.toBeNull());
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'New games' })).toBeNull();
});

test('a fetch that fails is silent', async () => {
  visit();
  const fetchMock = vi.fn(() => Promise.reject(new TypeError('offline')));
  vi.stubGlobal('fetch', fetchMock);
  render(<App store={null} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('region', { name: 'New games' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(readLastCheck('chesscom', 'me')).toBe(LAST);
});
