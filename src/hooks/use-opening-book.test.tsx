import { renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import { useOpening } from './use-opening-book';

const CUSTOM_START = `[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]

1. a8=Q+ *`;

test('names a game once the table has loaded', async () => {
  const replay = parseReplay(OPERA_GAME);
  const { result } = renderHook(() => useOpening(replay));
  expect(result.current).toBeNull();
  await waitFor(() =>
    expect(result.current).toEqual({ eco: 'C41', name: 'Philidor Defense' }),
  );
});

test('names a Sicilian by its deepest known position', async () => {
  const replay = parseReplay(
    '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *',
  );
  const { result } = renderHook(() => useOpening(replay));
  await waitFor(() => expect(result.current?.eco).toBe('B90'));
  expect(result.current?.name).toMatch(/^Sicilian Defense: Najdorf/);
});

test('a custom start gets no name and nothing breaks', async () => {
  const custom = parseReplay(CUSTOM_START);
  const opera = parseReplay(OPERA_GAME);
  // Both share one render, so the named game resolving shows the table has
  // loaded for the custom start's hook too.
  const { result } = renderHook(() => ({
    custom: useOpening(custom),
    named: useOpening(opera),
  }));
  await waitFor(() => expect(result.current.named).not.toBeNull());
  expect(result.current.custom).toBeNull();
});
