import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { saveLastReview } from '@/app/last-review';
import { memoryStore } from '@/lib/analysis/cache';
import { stored } from '@/lib/analysis/fixtures';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import App from './App';

// White (Paul Morphy) blunders at ply 10 and slips at ply 24.
const cps = [
  ...Array(11).fill(0),
  ...Array(14).fill(-400),
  ...Array(9).fill(-900),
];

async function savedStore(level: 'fast' | 'balanced' = 'balanced') {
  const store = memoryStore();
  await store.save(stored({ cps, level }));
  return store;
}

function openOverview(store: ReturnType<typeof memoryStore>) {
  location.hash = '#/overview';
  return render(<App store={store} />);
}

test('Overview sits second in the rail', () => {
  render(<App store={memoryStore()} />);
  const links = within(
    screen.getByRole('navigation', { name: 'Main' }),
  ).getAllByRole('link');
  expect(links.map((l) => l.textContent)).toEqual([
    'Games',
    'Overview',
    'Drill',
    'Review',
    'Settings',
  ]);
});

test('with nothing reviewed the coach says so and points to the Games page', async () => {
  const user = userEvent.setup();
  openOverview(memoryStore());
  expect(await screen.findByText('Nothing reviewed yet.')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /^Accuracy/ })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Pick a game' }));
  expect(screen.getByRole('link', { name: 'Games' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('a saved review of the player shows their progress', async () => {
  localStorage.setItem('lastUsername', 'paul morphy');
  openOverview(await savedStore());

  expect(
    await screen.findByRole('img', { name: /^Accuracy over your last 1 game/ }),
  ).toBeInTheDocument();

  const blunders = document.querySelector('[data-grade="blunder"]')!;
  expect(blunders).toHaveAttribute('data-count', '1');
  const opening = document.querySelector('[data-row="opening"]')!;
  expect(opening).toHaveTextContent('10.0 per 100 moves, 1 of 10');
  expect(document.querySelector('[data-row="endgame"]')).toHaveTextContent(
    '0.0 per 100 moves, 0 of 1',
  );

  // The PGN names no opening; its moves do.
  expect(
    await screen.findByRole('rowheader', { name: 'Philidor Defense' }),
  ).toBeInTheDocument();

  const recent = screen.getByRole('heading', { name: 'Recent games' });
  const game = within(recent.closest('[data-slot="card"]') as HTMLElement);
  expect(game.getByRole('listitem')).toHaveTextContent(
    'Paul Morphy (2690) vs Duke Karl / Count Isouard (2400)',
  );
  expect(game.getByText('Won')).toBeInTheDocument();
  expect(game.getByText('Balanced')).toBeInTheDocument();
});

test('a Lichess username counts beside a Chess.com one', async () => {
  localStorage.setItem('lastUsername', 'someone else');
  localStorage.setItem('lastLichessUsername', 'Paul Morphy');
  openOverview(await savedStore());

  expect(
    await screen.findByRole('img', { name: /^Accuracy over your last 1 game/ }),
  ).toBeInTheDocument();
});

test('games that are not the player’s are listed but never counted', async () => {
  openOverview(await savedStore());

  expect(
    await screen.findByText('None of these games are yours.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /^Accuracy/ })).toBeNull();
  expect(screen.queryByText('Grade mix')).toBeNull();
  expect(screen.getByRole('listitem')).toHaveTextContent(/Paul Morphy/);
  expect(screen.queryByText('Won')).toBeNull();
});

test('Review again opens the saved game at its saved level without the engine', async () => {
  localStorage.setItem('lastUsername', 'Duke Karl / Count Isouard');
  const user = userEvent.setup();
  openOverview(await savedStore('fast'));

  await user.click(
    await screen.findByRole('button', { name: /^Review again/ }),
  );

  expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Black is the player, so Black is at the bottom of the board.
  expect(
    await screen.findByRole('group', { name: /black at the bottom/ }),
  ).toBeInTheDocument();
  expect(screen.getByText('Fast review')).toBeInTheDocument();
  // jsdom has no Worker, so these figures can only have come from the store.
  const accuracy = await screen.findByLabelText('Black accuracy estimate');
  expect(accuracy.textContent).toMatch(/^\d/);
});

test('Settings counts the saved reviews and clears them after a second press', async () => {
  const user = userEvent.setup();
  const store = await savedStore();
  saveLastReview({
    replay: parseReplay(OPERA_GAME),
    source: 'Paul Morphy vs Duke Karl / Count Isouard',
    orientation: 'b',
    level: 'balanced',
  });
  location.hash = '#/settings';
  render(<App store={store} />);

  expect(await screen.findByText('1 saved review')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Clear saved reviews' }));
  expect(await store.list()).toHaveLength(1);
  expect(localStorage.getItem('lastReview')).not.toBeNull();

  await user.click(
    screen.getByRole('button', { name: 'Click again to clear' }),
  );
  expect(await screen.findByText('0 saved reviews')).toBeInTheDocument();
  expect(await store.list()).toEqual([]);
  expect(localStorage.getItem('lastReview')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Clear saved reviews' }),
  ).toBeDisabled();

  await user.click(screen.getByRole('link', { name: 'Review' }));
  expect(screen.getByText('No game loaded.')).toBeInTheDocument();
});

test('Settings says so when this browser cannot save reviews', () => {
  location.hash = '#/settings';
  render(<App store={null} />);
  expect(screen.getByText(/cannot save reviews/)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Clear saved reviews' }),
  ).toBeNull();
});
