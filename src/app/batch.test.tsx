import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { stored } from '@/lib/analysis/fixtures';
import type { Job } from '@/lib/analysis/protocol';
import { parseReplay } from '@/lib/chess/replay';

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

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'getBattery');
});

function showTab(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function openBatchPanel() {
  stubThreeGames();
  const store = memoryStore();
  await store.save(stored({ replay: parseReplay(pgn(1)) }));
  const user = userEvent.setup();
  render(<App store={store} />);
  await user.type(screen.getByLabelText('Chess.com username'), 'Me');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  const panel = (await screen.findByRole('heading', { name: 'Review in bulk' }))
    .parentElement!.parentElement!;
  const analyze = await within(panel).findByRole('button', {
    name: 'Analyze 1 game',
  });
  return { user, panel, analyze, store };
}

const MOVES: Record<number, string> = {
  1: '1. e4 e5 2. Nf3',
  3: '1. d4 d5 2. c4',
};
const pgn = (n: number) =>
  `[White "Me"]\n[Black "Rival${n}"]\n[Link "https://www.chess.com/game/live/${n}"]\n\n${MOVES[n]} *`;

function stubThreeGames() {
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body)));
  const game = (n: number) => ({
    url: `https://www.chess.com/game/live/${n}`,
    pgn: pgn(n),
    end_time: 1735949652 + n * 60,
    time_control: '180',
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    white: { username: 'Me', rating: 1500, result: 'win' },
    black: { username: `Rival${n}`, rating: 1490, result: 'resigned' },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/games/archives'))
        return json({ archives: ['https://x/pub/player/me/games/2025/01'] });
      if (url.includes('/games/2025/01'))
        return json({ games: [game(1), game(3)] });
      return json({ username: 'Me', joined: 1 });
    }),
  );
}

const marks = () =>
  [...document.querySelectorAll('[data-mark]')].map((m) =>
    m.getAttribute('data-mark'),
  );

test('analyzes the latest games in one go and marks each as reviewed', async () => {
  stubThreeGames();
  const store = memoryStore();
  await store.save(stored({ replay: parseReplay(pgn(1)) }));
  const user = userEvent.setup();
  render(<App store={store} />);
  await user.type(screen.getByLabelText('Chess.com username'), 'Me');
  await user.click(screen.getByRole('button', { name: 'Find games' }));

  const panel = (await screen.findByRole('heading', { name: 'Review in bulk' }))
    .parentElement!.parentElement!;
  expect(
    await within(panel).findByText(/^1 game to analyze\. 1 already reviewed/),
  ).toBeInTheDocument();
  expect(marks()).toEqual(['reviewed']);

  await user.click(
    within(panel).getByRole('button', { name: 'Analyze 1 game' }),
  );
  expect(
    await within(panel).findByText(
      'Done. 1 game reviewed and saved.',
      {},
      { timeout: 5_000 },
    ),
  ).toBeInTheDocument();
  expect(await store.list()).toHaveLength(2);
  await waitFor(() => expect(marks()).toEqual(['reviewed', 'reviewed']));
  expect(
    within(panel).getByText('All 2 games are reviewed at Balanced already.'),
  ).toBeInTheDocument();
  expect(
    within(panel).getByRole('button', { name: 'Analyze 0 games' }),
  ).toBeDisabled();
});

test('a staged game reviewed at this mode opens as it was', async () => {
  stubThreeGames();
  const store = memoryStore();
  await store.save(stored({ replay: parseReplay(pgn(3)), level: 'deep' }));
  const user = userEvent.setup();
  render(<App store={store} />);
  await user.type(screen.getByLabelText('Chess.com username'), 'Me');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  await user.click(await screen.findByRole('button', { name: /Rival3/ }));

  expect(screen.getByText('3 moves, reviewed at Deep')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open review' }));
  expect(await screen.findByText('Deep review')).toBeInTheDocument();
});

test('a batch waits while the tab is hidden and finishes once it is shown', async () => {
  const { user, panel, analyze, store } = await openBatchPanel();
  showTab('hidden');
  await user.click(analyze);

  expect(
    await within(panel).findByText(/0 of \d+ positions settled/),
  ).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(within(panel).queryByText(/^Done\./)).toBeNull();
  expect(await store.list()).toHaveLength(1);

  showTab('visible');
  expect(
    await within(panel).findByText(
      'Done. 1 game reviewed and saved.',
      {},
      { timeout: 5_000 },
    ),
  ).toBeInTheDocument();
});

test('a batch on a low battery says so and goes on after "Continue anyway"', async () => {
  Object.defineProperty(navigator, 'getBattery', {
    configurable: true,
    value: () =>
      Promise.resolve(
        Object.assign(new EventTarget(), { charging: false, level: 0.1 }),
      ),
  });
  const { user, panel, analyze } = await openBatchPanel();
  await user.click(analyze);

  expect(
    await within(panel).findByText(/paused while your battery is low/),
  ).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(within(panel).queryByText(/^Done\./)).toBeNull();

  await user.click(
    within(panel).getByRole('button', { name: 'Continue anyway' }),
  );
  expect(
    await within(panel).findByText(
      'Done. 1 game reviewed and saved.',
      {},
      { timeout: 5_000 },
    ),
  ).toBeInTheDocument();
});
