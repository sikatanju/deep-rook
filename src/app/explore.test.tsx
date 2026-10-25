import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';
import type { Job } from '@/lib/analysis/protocol';

// The analysis test's worker: the real engine on the main thread, answering
// asynchronously, with the node cap shrunk so a search takes milliseconds.
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

async function openOperaGame(store = memoryStore()) {
  const user = userEvent.setup();
  render(<App store={store} />);
  await user.click(screen.getByRole('button', { name: 'Try the Opera Game' }));
  await user.click(screen.getByRole('button', { name: 'Review game' }));
  return user;
}

const square = (name: string) =>
  within(screen.getByRole('group', { name: /Chess board/ })).getByRole(
    'button',
    { name },
  );
const piece = (square: string) =>
  document
    .querySelector(`[data-square="${square}"] [data-piece]`)
    ?.getAttribute('data-piece') ?? null;
const coach = () => screen.getByRole('region', { name: 'Coach' });
const moves = () => screen.getByRole('region', { name: 'Moves' });

/** After 1. e4, Black tries 1... c5 in place of the game's 1... e5. */
async function trySicilian(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  await user.click(square('c7, black pawn'));
  await user.click(square('c5'));
}

test('moving a piece plays a side line the game keeps apart', async () => {
  const user = await openOperaGame();
  await trySicilian(user);

  expect(piece('c5')).toBe('bP');
  expect(piece('c7')).toBeNull();
  expect(coach()).toHaveTextContent('Not part of the game. 1… c5.');
  expect(within(moves()).getByRole('button', { name: 'e4' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(screen.getByRole('button', { name: 'Autoplay' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Back to the game' }));
  expect(piece('c5')).toBeNull();
  expect(piece('c7')).toBe('bP');
  expect(piece('e4')).toBe('wP');
});

test('the step keys walk the side line, and Escape leaves it', async () => {
  const user = await openOperaGame();
  await trySicilian(user);

  await user.keyboard('{ArrowLeft}');
  expect(piece('c5')).toBeNull();
  expect(piece('e4')).toBe('wP');
  expect(coach()).toHaveTextContent('Play a move, or step forward');

  await user.keyboard('{ArrowRight}');
  expect(piece('c5')).toBe('bP');
  expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('button', { name: 'Back to the game' })).toBeNull();
  expect(piece('c5')).toBeNull();
});

test('a move after stepping back replaces the rest of the line', async () => {
  const user = await openOperaGame();
  await trySicilian(user);
  await user.click(square('g1, white knight'));
  await user.click(square('f3'));
  expect(coach()).toHaveTextContent('1… c5 2. Nf3.');

  await user.keyboard('{ArrowLeft}');
  await user.click(square('b1, white knight'));
  await user.click(square('c3'));
  expect(coach()).toHaveTextContent('1… c5 2. Nc3.');
  expect(piece('f3')).toBeNull();
});

test("playing the game's own next move just advances the game", async () => {
  const user = await openOperaGame();
  await user.click(square('e2, white pawn'));
  expect(
    document.querySelector('[data-square="e4"] [data-target]'),
  ).not.toBeNull();
  await user.click(square('e4'));

  expect(within(moves()).getByRole('button', { name: 'e4' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(piece('e4')).toBe('wP');
  expect(screen.queryByRole('button', { name: 'Back to the game' })).toBeNull();
});

test('clicking the move list leaves the side line for the game', async () => {
  const user = await openOperaGame();
  await trySicilian(user);
  await user.click(within(moves()).getByRole('button', { name: 'Nf3' }));
  expect(screen.queryByRole('button', { name: 'Back to the game' })).toBeNull();
  expect(piece('f3')).toBe('wN');
  expect(piece('c5')).toBeNull();
});

test('a pawn reaching the last rank asks which piece', async () => {
  const user = userEvent.setup();
  render(<App store={memoryStore()} />);
  await user.click(screen.getByLabelText('PGN'));
  await user.paste(`[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]

1. a8=Q+ Kg7 *`);
  await user.click(screen.getByRole('button', { name: 'Load PGN' }));
  await user.click(screen.getByRole('button', { name: 'Review game' }));

  await user.click(square('a7, white pawn'));
  await user.click(square('a8'));
  expect(piece('a7')).toBe('wP');
  await user.click(screen.getByRole('button', { name: 'Knight' }));

  expect(piece('a8')).toBe('wN');
  expect(coach()).toHaveTextContent('Not part of the game. 1. a8=N.');
});

test('a side move is graded and the engine line plays out on the board', async () => {
  const user = await openOperaGame();
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  await user.click(square('d7, black pawn'));
  await user.click(square('d5'));

  await waitFor(() => expect(coach()).toHaveTextContent(/1… d5 is an? \w+/), {
    timeout: 20_000,
  });
  const engine = await within(coach()).findByRole(
    'group',
    { name: 'Engine line' },
    { timeout: 20_000 },
  );
  const [first, second] = within(engine).getAllByRole('button');
  expect(first).toHaveTextContent(/^2\. \S+$/);

  await user.click(second!);
  expect(coach()).toHaveTextContent(/1… d5 2\. \S+ \S+\./);

  // Its middle move was never searched alone, so nothing can grade the last
  // one; the coach must not wait for a verdict that cannot come.
  await waitFor(() => expect(coach()).toHaveTextContent('Your side line.'), {
    timeout: 20_000,
  });
});

test('"Try it" rewinds to the position and plays the engine\'s move', async () => {
  // The saved review blunders 4...Bxf3 and wanted 4...dxe5.
  const store = memoryStore();
  await store.save(stored({ ...OPERA_SLIPS, level: 'fast' }));
  localStorage.setItem('settings', JSON.stringify({ analysisLevel: 'fast' }));
  const user = await openOperaGame(store);
  await user.click(within(moves()).getByRole('button', { name: 'Bxf3' }));

  await user.click(
    await screen.findByRole('button', { name: 'Try dxe5 on the board' }),
  );
  expect(piece('e5')).toBe('bP');
  expect(piece('d6')).toBeNull();
  expect(coach()).toHaveTextContent('Not part of the game. 4… dxe5.');

  // The move matches the saved line's own choice, so the probe agrees it is best.
  await waitFor(() => expect(coach()).toHaveTextContent('4… dxe5 is a best'), {
    timeout: 20_000,
  });
  await user.click(screen.getByRole('button', { name: 'Back to the game' }));
  expect(piece('d6')).toBe('bP');
});

test('"Try it" on a side move swaps it for the engine\'s choice', async () => {
  const user = await openOperaGame();
  await user.click(screen.getByRole('button', { name: 'Next move' }));
  await user.click(square('d7, black pawn'));
  await user.click(square('d5'));

  // The engine prefers another move to 1... d5; "Try it" swaps it in.
  const tryIt = await screen.findByRole(
    'button',
    { name: /^Try \S+ on the board$/ },
    { timeout: 20_000 },
  );
  const san = /^Try (\S+) on/.exec(tryIt.getAttribute('aria-label')!)![1]!;
  await user.click(tryIt);
  expect(piece('d5')).toBeNull();
  expect(coach()).toHaveTextContent(`Not part of the game. 1… ${san}.`);
});
