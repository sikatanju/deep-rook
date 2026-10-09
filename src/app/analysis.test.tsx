import { render, screen, waitFor } from '@testing-library/react';
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

test('the review page shows the engine evaluation, best line, and arrow', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
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
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
  await user.click(screen.getByRole('radio', { name: 'Fast' }));

  await waitFor(() =>
    expect(screen.getByText(/^Fast/, { selector: 'span' })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  expect(screen.getByRole('radio', { name: /Fast/ })).toBeChecked();
});
