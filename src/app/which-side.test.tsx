import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

// A Worker stand-in, so the analyzer is available to save the review again.
// The saved review covers the whole game, so it never searches.
vi.hoisted(() => {
  class IdleWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    postMessage() {}
    terminate() {}
  }
  globalThis.Worker = IdleWorker as never;
});

import { exportBackup, importBackup } from '@/lib/analysis/backup';
import { memoryStore } from '@/lib/analysis/cache';
import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';
import { OPERA_GAME } from '@/lib/chess/replay';

import App from './App';

const WHITE = 'Paul Morphy';
const BLACK = 'Duke Karl / Count Isouard';

async function openGames(saved = true) {
  const store = memoryStore();
  // Saved at the default mode, so reviewing it needs no engine.
  if (saved) await store.save(stored({ ...OPERA_SLIPS, level: 'balanced' }));
  location.hash = '#/games';
  render(<App store={store} />);
  return { store, user: userEvent.setup() };
}

async function paste(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('textbox', { name: 'PGN' }));
  await user.paste(OPERA_GAME);
}

const side = (name: string) => screen.getByRole('radio', { name });

async function load(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Load PGN' }));
}

test('the import offers White, Black and Not me, with nobody picked when no name matches', async () => {
  const { user } = await openGames(false);
  await paste(user);

  expect(side('White')).not.toBeChecked();
  expect(side('Black')).not.toBeChecked();
  expect(side('Not me')).toBeChecked();
});

test('it defaults to the side a saved name matches', async () => {
  localStorage.setItem('lastUsername', BLACK);
  const { user } = await openGames(false);
  await paste(user);

  expect(side('Black')).toBeChecked();
  await user.click(side('White'));
  expect(side('White')).toBeChecked();
});

test('Load stores the side shown selected: the name match by default, else Not me', async () => {
  localStorage.setItem('lastUsername', BLACK);
  const named = await openGames();
  await paste(named.user);
  expect(side('Black')).toBeChecked();
  await load(named.user);
  await named.user.click(screen.getByRole('button', { name: 'Open review' }));
  await waitFor(async () =>
    expect((await named.store.list())[0]?.replay.mine).toBe('b'),
  );
});

test('Load stores Not me when no name matches and nothing was picked', async () => {
  const { store, user } = await openGames();
  await paste(user);
  expect(side('Not me')).toBeChecked();
  await load(user);
  await user.click(screen.getByRole('button', { name: 'Open review' }));
  await waitFor(async () =>
    expect((await store.list())[0]?.replay.mine).toBeNull(),
  );
});

test('the chosen side orients the review, is saved with it, and counts on Overview and Drill with no name', async () => {
  const { store, user } = await openGames();
  await paste(user);
  await user.click(side('Black'));
  await load(user);
  await user.click(screen.getByRole('button', { name: 'Open review' }));

  expect(
    await screen.findByRole('group', { name: /black at the bottom/ }),
  ).toBeInTheDocument();
  await waitFor(async () =>
    expect((await store.list())[0]?.replay.mine).toBe('b'),
  );

  await user.click(screen.getByRole('link', { name: 'Overview' }));
  expect(
    await screen.findByRole('img', { name: /^Accuracy over your last 1 game/ }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: /^Drill/ }));
  expect(
    screen.queryByText('None of these games are yours.'),
  ).not.toBeInTheDocument();
  expect(await screen.findByText(/Drill 1 of 2/)).toBeInTheDocument();
});

test('a chosen side overrides a matching name, and Not me takes the game out of Overview', async () => {
  localStorage.setItem('lastUsername', WHITE);
  const { store, user } = await openGames();
  await paste(user);
  expect(side('White')).toBeChecked();
  await user.click(side('Not me'));
  await load(user);
  await user.click(screen.getByRole('button', { name: 'Open review' }));
  await screen.findByRole('group', { name: /white at the bottom/ });
  await waitFor(async () =>
    expect((await store.list())[0]?.replay.mine).toBeNull(),
  );

  await user.click(screen.getByRole('link', { name: 'Overview' }));
  expect(
    await screen.findByText('None of these games are yours.'),
  ).toBeInTheDocument();
});

test('an older saved review without a side still resolves by name, and a backup keeps a side', async () => {
  localStorage.setItem('lastUsername', BLACK);
  const store = memoryStore();
  await store.save(stored({ ...OPERA_SLIPS, level: 'balanced' }));
  expect((await store.list())[0]?.replay).not.toHaveProperty('mine');
  location.hash = '#/overview';
  render(<App store={store} />);
  expect(
    await screen.findByRole('img', { name: /^Accuracy over your last 1 game/ }),
  ).toBeInTheDocument();

  const replay = { ...stored().replay, mine: 'b' as const };
  const chosen = memoryStore();
  await chosen.save(stored({ replay }));
  const restored = memoryStore();
  await importBackup(await exportBackup(chosen, null), restored, null);
  expect((await restored.list())[0]?.replay.mine).toBe('b');
});
