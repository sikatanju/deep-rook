import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import { shareUrl } from '@/lib/share/link';

import App from './App';

afterEach(() => vi.unstubAllGlobals());

const SHORT_GAME = `[White "Alice"]
[Black "Bob"]

1. d4 {[%clk 0:03:00]} 1... d5 {[%clk 0:02:58]} 2. c4 *`;

/** The hash part of a share link, as a recipient's browser would load it. */
async function linkHash(pgn: string, side: 'w' | 'b' = 'w') {
  const url = await shareUrl(parseReplay(pgn), side, 'https://x.example/');
  return new URL(url).hash;
}

const player = (side: 'White' | 'Black') =>
  screen.getByRole('group', { name: `${side} player` });

test('opening a review link reviews that game, then cleans the address', async () => {
  location.hash = await linkHash(OPERA_GAME, 'b');
  const entries = history.length;
  render(<App store={memoryStore()} />);

  expect(
    await screen.findByRole('img', { name: /black at the bottom/ }),
  ).toBeInTheDocument();
  expect(within(player('White')).getByText('Paul Morphy')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    screen.getByRole('heading', {
      name: 'Paul Morphy vs Duke Karl / Count Isouard',
    }),
  ).toBeInTheDocument();
  await waitFor(() => expect(location.hash).toBe('#/review'));
  expect(history.length).toBe(entries);
});

test('a broken link lands on the Games page with a notice, and the bad address is gone', async () => {
  const good = await linkHash(OPERA_GAME);
  location.hash = good.slice(0, good.length - 40);
  render(<App store={memoryStore()} />);

  const notice = await screen.findByRole('alert');
  expect(notice).toHaveTextContent('That shared link did not open.');
  expect(
    screen.getByRole('heading', { name: /Pick a game to roast/ }),
  ).toBeInTheDocument();
  expect(location.hash).toBe('#/games');

  within(notice).getByRole('button', { name: 'Dismiss' }).click();
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

test('a link from another version is refused the same way', async () => {
  location.hash = (await linkHash(OPERA_GAME)).replace('v=1', 'v=9');
  render(<App store={memoryStore()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /different version/,
  );
});

/**
 * Holds back the first decode until released, so a second link can arrive
 * while it is still in flight.
 */
function holdFirstDecode() {
  const Real = DecompressionStream;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  vi.stubGlobal(
    'DecompressionStream',
    class {
      readable: ReadableStream;
      writable: WritableStream;
      constructor(format: CompressionFormat) {
        const real = new Real(format);
        this.writable = real.writable;
        this.readable =
          calls++ > 0
            ? real.readable
            : real.readable.pipeThrough(
                new TransformStream({
                  async transform(chunk, out) {
                    await gate;
                    out.enqueue(chunk);
                  },
                }),
              );
      }
    },
  );
  return release;
}

test('when two links arrive in a row, the second one wins', async () => {
  const first = await linkHash(OPERA_GAME);
  const second = await linkHash(SHORT_GAME);
  const release = holdFirstDecode();
  location.hash = first;
  render(<App store={memoryStore()} />);
  await screen.findByText('Opening the shared game…');

  location.hash = second;
  expect(
    await within(
      await screen.findByRole('group', { name: 'White player' }),
    ).findByText('Alice'),
  ).toBeInTheDocument();

  release();
  await new Promise((r) => setTimeout(r, 50));
  expect(within(player('White')).getByText('Alice')).toBeInTheDocument();
  expect(screen.queryByText('Paul Morphy')).toBeNull();
  expect(location.hash).toBe('#/review');
});
