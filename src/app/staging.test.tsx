import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import type { Job } from '@/lib/analysis/protocol';

// Same stand-in as analysis.test.tsx, plus a count of the jobs it was handed.
const searches = vi.hoisted(() => ({ count: 0 }));
vi.hoisted(() => {
  class InProcessWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    private dead = false;
    postMessage({ jobId, ...request }: Job) {
      searches.count++;
      setTimeout(async () => {
        const { createEngine } = await import('@/lib/engine/engine');
        const send = (data: unknown) =>
          !this.dead && this.onmessage?.({ data });
        const outcome = createEngine().search(
          { ...request, nodes: Math.min(request.nodes, 3_000) },
          (line) => send({ kind: 'line', jobId, line }),
        );
        send({ kind: 'done', jobId, outcome });
      });
    }
    terminate() {
      this.dead = true;
    }
  }
  globalThis.Worker = InProcessWorker as never;
});

import App from './App';

beforeEach(() => {
  searches.count = 0;
});

const reviewLink = () => screen.getByRole('link', { name: 'Review' });
const stageOperaGame = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));

test('staging a game neither opens the review nor starts the engine', async () => {
  const user = userEvent.setup();
  render(<App />);
  await stageOperaGame(user);

  expect(reviewLink()).not.toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('img', { name: /Chess board/ })).toBeNull();
  expect(screen.getByText('The Opera Game')).toBeInTheDocument();
  expect(screen.getByText('33 moves')).toBeInTheDocument();
  // A beat for any stray search to be posted.
  await new Promise((r) => setTimeout(r, 200));
  expect(searches.count).toBe(0);

  await user.click(screen.getByRole('button', { name: 'Review game' }));
  expect(reviewLink()).toHaveAttribute('aria-current', 'page');
  await waitFor(() => expect(searches.count).toBeGreaterThan(0));
});

test('the mode chosen before pressing Review game is the mode of the review', async () => {
  const user = userEvent.setup();
  render(<App />);
  await stageOperaGame(user);
  await user.click(screen.getByRole('radio', { name: 'Deep' }));
  expect(screen.getByText(/Strongest lines/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Review game' }));

  expect(screen.getByRole('region', { name: 'Game report' })).toHaveTextContent(
    'Deep review',
  );
});

test('changing the mode for the next game leaves the running review alone', async () => {
  const user = userEvent.setup();
  render(<App />);
  await stageOperaGame(user);
  await user.click(screen.getByRole('button', { name: 'Review game' }));

  await user.click(screen.getByRole('link', { name: 'Games' }));
  await user.type(screen.getByLabelText('PGN'), '1. e4 e5');
  await user.click(screen.getByRole('button', { name: 'Load PGN' }));
  await user.click(screen.getByRole('radio', { name: 'Deep' }));
  await user.click(reviewLink());

  expect(screen.getByText('The Opera Game')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Game report' })).toHaveTextContent(
    'Balanced review',
  );
});

test('continuing the review of the same game keeps its analysis', async () => {
  const user = userEvent.setup();
  render(<App />);
  await stageOperaGame(user);
  await user.click(screen.getByRole('button', { name: 'Review game' }));
  const bar = () =>
    screen.getByRole('meter', { name: "White's winning chances" });
  // The last position is mate, so its bar is full once the engine has been there.
  await user.keyboard('{End}');
  await waitFor(() => expect(bar()).toHaveAttribute('aria-valuenow', '100'), {
    timeout: 5_000,
  });

  await user.click(screen.getByRole('link', { name: 'Games' }));
  await user.click(screen.getByRole('button', { name: 'Continue review' }));

  // Straight away, with no new search: the analysis was kept.
  await user.keyboard('{End}');
  expect(bar()).toHaveAttribute('aria-valuenow', '100');
});
