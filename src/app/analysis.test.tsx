import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { Job } from '@/lib/analysis/protocol';

// jsdom has no Worker. This one runs the real engine on the main thread,
// asynchronously like a worker, with the node cap shrunk so the test is fast.
// Hoisted so protocol.ts sees it when it checks for Worker at import time.
vi.hoisted(() => {
  class InProcessWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    private dead = false;
    postMessage({ jobId, ...request }: Job) {
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

async function openOperaGame(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
  await user.click(screen.getByRole('button', { name: 'Review game' }));
}

test('the review page shows the engine evaluation, best line, and arrow', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openOperaGame(user);
  await user.keyboard('{End}');
  await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');

  // Position 30: Qb8+ Nxb8 Rd8# is mate in 2 for White.
  await waitFor(
    () => expect(screen.getByLabelText('Evaluation')).toHaveTextContent('#2'),
    { timeout: 5_000 },
  );
  expect(screen.getByText('Qb8+ Nxb8 Rd8#')).toBeInTheDocument();
  expect(document.querySelector('[data-arrow="b3b8"]')).not.toBeNull();
  expect(
    screen.getByRole('meter', { name: "White's winning chances" }),
  ).toHaveAttribute('aria-valuenow', '100');
});

test('the board carries the move grade on the piece, once the engine has graded it', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openOperaGame(user);
  await user.click(screen.getByRole('button', { name: 'Next move' }));

  // The flight is drawn before the engine has graded anything.
  const flight = document.querySelector('[data-moving]');
  expect(flight).toHaveAttribute('data-moving', 'e2e4');

  // The grade arrives late, on its own flush.
  const badge = await waitFor(
    () => {
      const found = document.querySelector('[data-square="e4"] [data-grade]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    },
    { timeout: 20_000 },
  );
  expect(badge).toHaveAttribute('role', 'img');
  expect(badge.getAttribute('aria-label')).toBeTruthy();
  expect(badge.closest('[data-square]')).toHaveAttribute('data-square', 'e4');

  // It is drawn over the destination square's piece, not in place of it.
  expect(
    document.querySelector('[data-square="e4"] [data-piece="wP"]'),
  ).not.toBeNull();
  // A late grade must not restart the flight that is already running: the same
  // element is still flying, and its animation was never re-armed.
  expect(document.querySelector('[data-moving]')).toBe(flight);
  expect(badge.parentElement).not.toBe(flight);
});

test('the analysis depth setting persists across reloads', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<App />);
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  await user.click(screen.getByRole('radio', { name: /Deep/ }));
  unmount();

  render(<App />);
  expect(screen.getByRole('radio', { name: /Deep/ })).toBeChecked();
});

test('the review page switches analysis depth', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openOperaGame(user);
  await user.click(screen.getByRole('radio', { name: 'Fast' }));

  await waitFor(() =>
    expect(screen.getByText(/^Fast/, { selector: 'span' })).toBeInTheDocument(),
  );
  // The switch is also the remembered default for the next review.
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  expect(screen.getByRole('radio', { name: /Fast/ })).toBeChecked();
});

test('the eval graph and game report fill in as analysis settles', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openOperaGame(user);

  // The first flush gives the graph its series (34 positions of the Opera
  // Game) and the report card its placeholders.
  const graph = await screen.findByRole(
    'img',
    { name: /^Evaluation graph/ },
    { timeout: 5_000 },
  );
  screen.getByRole('region', { name: 'Game report' });
  expect(document.querySelectorAll('[data-accuracy]')).toHaveLength(2);
  const board = screen.getByRole('img', { name: /white at the bottom/ });
  expect(
    board.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  // Settled positions become drawn runs and real accuracy figures: positions
  // 0 and 1 alone grade 1.e4 for White.
  await waitFor(
    () => expect(document.querySelector('polyline[data-seg]')).not.toBeNull(),
    { timeout: 10_000 },
  );
  expect(document.querySelector('line[data-cursor]')).not.toBeNull();
  await waitFor(
    () =>
      expect(
        document.querySelector('[data-accuracy="w"]')?.textContent,
      ).toMatch(/^\d/),
    { timeout: 20_000 },
  );
});

test('scrubbing the eval graph moves the game to that position', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openOperaGame(user);
  const graph = await screen.findByRole(
    'img',
    { name: /^Evaluation graph/ },
    { timeout: 5_000 },
  );

  // A flat 1000px-wide rect over the Opera Game's 34 positions: x=500 scrubs
  // to index round(0.5·33) = 17, the position after 9.Bg5 (ply 16).
  const rect = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1000,
      bottom: 100,
      left: 0,
      width: 1000,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);
  fireEvent.pointerDown(graph, { clientX: 500, pointerId: 1 });
  rect.mockRestore();

  expect(screen.getByRole('button', { name: /Bg5/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
});

test('pressing or dragging the eval graph on the shown position keeps the piece flying', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openOperaGame(user);
  const graph = await screen.findByRole(
    'img',
    { name: /^Evaluation graph/ },
    { timeout: 5_000 },
  );
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  const flight = document.querySelector('[data-moving]');
  expect(flight).toHaveAttribute('data-moving', 'e2e4');

  // 1000px wide over 34 positions: x=30 and x=40 both scrub to index 1, the
  // position after 1.e4 that is already shown.
  vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1000, 100),
  );
  fireEvent.pointerDown(graph, { clientX: 30, pointerId: 1 });
  fireEvent.pointerMove(graph, { clientX: 40, pointerId: 1 });
  fireEvent.pointerUp(graph, { clientX: 40, pointerId: 1 });

  expect(graph).toHaveAccessibleName(/^Evaluation graph, position 2 of 34/);
  expect(document.querySelector('[data-moving]')).toBe(flight);
});

test('stepping past the last move keeps the last move flying', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openOperaGame(user);
  await user.keyboard('{End}{ArrowLeft}{ArrowRight}');
  const flight = document.querySelector('[data-moving]');
  expect(flight).toHaveAttribute('data-moving', 'd1d8');

  await user.keyboard('{ArrowRight}');

  expect(document.querySelector('[data-moving]')).toBe(flight);
});
