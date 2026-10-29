import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { saveLastReview } from '@/app/last-review';
import { exportBackup } from '@/lib/analysis/backup';
import { memoryStore, type GameKey } from '@/lib/analysis/cache';
import { stored } from '@/lib/analysis/fixtures';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import App from './App';
import { loadSettings } from './store';

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
  expect(opening).toHaveTextContent('14.3 per 100 moves, 1 of 7');
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

  const beside = (name: string) =>
    screen.getByRole('heading', { name }).parentElement!;
  expect(beside('Accuracy')).toHaveTextContent(
    'Your latest 1 game, oldest to newest.',
  );
  expect(beside('Grade mix')).toHaveTextContent(
    'Every move you played in the game matched to you.',
  );
  expect(beside('Where mistakes happen')).toHaveTextContent(
    'Mistakes, misses and blunders per 100 of your moves in the game matched to you.',
  );
  expect(beside('Time trouble')).toHaveTextContent(
    'None of the games matched to you have a clock.',
  );
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
  expect(screen.getByRole('button', { name: /^Review again/ })).toBeDisabled();
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
    index: 0,
  });
  localStorage.setItem('drillStreak', '{"last":"2026-01-01","run":3}');
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
  expect(localStorage.getItem('drillStreak')).toBeNull();
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

test('the filter narrows the Overview by speed and side', async () => {
  localStorage.setItem('lastUsername', 'paul morphy');
  const store = memoryStore();
  const replay = parseReplay(
    OPERA_GAME.replace('[Result', '[TimeControl "300+3"]\n[Result'),
  );
  await store.save(stored({ replay, cps }));
  const user = userEvent.setup();
  openOverview(store);

  const speed = await screen.findByRole('group', { name: 'Time control' });
  expect(
    within(speed)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Any speed', 'Blitz']);

  await user.click(screen.getByRole('button', { name: 'Black' }));
  expect(screen.getByText('No games match this filter.')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /^Accuracy/ })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'White' }));
  await user.click(screen.getByRole('button', { name: 'Blitz' }));
  expect(
    await screen.findByRole('img', { name: /^Accuracy over your last 1 game/ }),
  ).toBeInTheDocument();
});

test('the trend draws the player’s rating over the bars, with a gap for a game without one', async () => {
  localStorage.setItem('lastUsername', 'paul morphy');
  const store = memoryStore();
  const game = (round: string, elo: string | null) =>
    parseReplay(
      OPERA_GAME.replace(
        /\[WhiteElo "\d+"\]\n/,
        elo ? `[WhiteElo "${elo}"]\n` : '',
      ).replace('[Result', `[Round "${round}"]\n[Result`),
    );
  const rounds = [
    ['1', '2600'],
    ['2', null],
    ['3', '2650'],
  ] as const;
  // The key is the game's positions, so same-moves games need keys of their own.
  for (const [i, [round, elo]] of rounds.entries())
    await store.save({
      ...stored({ replay: game(round, elo), cps, analyzedAt: i + 1 }),
      key: `rated-${i}` as GameKey,
    });
  openOverview(store);

  const chart = await screen.findByRole('img', {
    name: /^Accuracy over your last 3 games.*your rating, latest 2650/,
  });
  expect(
    [...chart.querySelectorAll('[data-rating]')].map((d) =>
      d.getAttribute('data-rating'),
    ),
  ).toEqual(['2600', '2650']);
  expect(chart.querySelector('path[d*="L"]')).toBeNull();
  expect(chart.closest('div.flex')!.querySelector('p')).toHaveTextContent(
    'The line is your rating, latest 2650, from 2600 to 2650.',
  );
});

test('Settings imports a backup file into the saved reviews', async () => {
  const user = userEvent.setup();
  const source = await savedStore();
  const backup = await exportBackup(source, null);
  location.hash = '#/settings';
  render(<App store={memoryStore()} />);

  expect(await screen.findByText('0 saved reviews')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export backup' })).toBeDisabled();

  const file = (text: string) =>
    new File([text], 'backup.json', { type: 'application/json' });
  await user.upload(screen.getByTestId('backup-file'), file('nope'));
  expect(await screen.findByText(/not a DeepRook backup/)).toBeInTheDocument();

  await user.upload(screen.getByTestId('backup-file'), file(backup));
  expect(await screen.findByText('1 saved review')).toBeInTheDocument();
  expect(
    screen.getByText('Imported 1 review and 0 drill records.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled();
});

test('importing a backup restores its board size setting', async () => {
  const user = userEvent.setup();
  const backup = await exportBackup(await savedStore(), null, {
    boardSize: 720,
  });
  location.hash = '#/settings';
  render(<App store={memoryStore()} />);
  await user.upload(
    await screen.findByTestId('backup-file'),
    new File([backup], 'backup.json', { type: 'application/json' }),
  );
  expect(await screen.findByText('1 saved review')).toBeInTheDocument();
  expect(loadSettings().boardSize).toBe(720);
});

test('the empty Review page reopens your latest saved game', async () => {
  localStorage.setItem('lastUsername', 'Duke Karl / Count Isouard');
  const user = userEvent.setup();
  location.hash = '#/review';
  render(<App store={await savedStore()} />);

  await user.click(
    await screen.findByRole('button', { name: 'Review my latest game' }),
  );
  expect(
    await screen.findByRole('group', { name: /black at the bottom/ }),
  ).toBeInTheDocument();
});

test('the empty Review page offers no shortcut when none of the saved games is yours', async () => {
  location.hash = '#/review';
  render(<App store={await savedStore()} />);
  expect(await screen.findByText('No game loaded.')).toBeInTheDocument();
  await act(async () => {}); // let the saved games load
  expect(
    screen.queryByRole('button', { name: 'Review my latest game' }),
  ).toBeNull();
});

async function blitzStore() {
  const store = memoryStore();
  const replay = parseReplay(
    OPERA_GAME.replace('[Result', '[TimeControl "300+3"]\n[Result'),
  );
  await store.save(stored({ replay, cps }));
  return store;
}

test('stage bars and opening rows link to the drills they hold', async () => {
  localStorage.setItem('lastUsername', 'paul morphy');
  openOverview(await savedStore());

  const opening = await screen.findByRole('link', {
    name: '1 drill for opening mistakes',
  });
  expect(opening).toHaveAttribute('href', '#/drill?stage=opening');
  expect(
    screen.getByRole('link', { name: '1 drill for middlegame mistakes' }),
  ).toHaveAttribute('href', '#/drill?stage=middlegame');
  // No drill came in the endgame: it says so instead of linking to nothing.
  const endgame = document.querySelector('[data-row="endgame"]')!;
  expect(endgame).toHaveTextContent('No drills');
  expect(within(endgame as HTMLElement).queryByRole('link')).toBeNull();

  const row = screen.getByRole('rowheader', {
    name: 'Philidor Defense',
  }).parentElement!;
  expect(within(row).getByRole('link')).toHaveAttribute(
    'href',
    '#/drill?opening=Philidor+Defense',
  );
  expect(within(row).getByRole('link')).toHaveAccessibleName(
    '2 drills for Philidor Defense',
  );
});

test('the links carry the Overview side and speed, and count under them', async () => {
  localStorage.setItem('lastUsername', 'paul morphy');
  const user = userEvent.setup();
  openOverview(await blitzStore());
  await screen.findByRole('link', { name: '1 drill for opening mistakes' });

  await user.click(screen.getByRole('button', { name: 'Blitz' }));
  await user.click(screen.getByRole('button', { name: 'White' }));
  expect(
    screen.getByRole('link', { name: '1 drill for opening mistakes' }),
  ).toHaveAttribute('href', '#/drill?stage=opening&side=w&speed=blitz');

  // Black has no drills in this game.
  await user.click(screen.getByRole('button', { name: 'Black' }));
  expect(screen.getByText('No games match this filter.')).toBeInTheDocument();
});

test('following a link opens the Drill page on that filter', async () => {
  localStorage.setItem('lastUsername', 'paul morphy');
  const user = userEvent.setup();
  openOverview(await savedStore());

  await user.click(
    await screen.findByRole('link', { name: '2 drills for Philidor Defense' }),
  );
  expect(
    await screen.findByRole('heading', {
      name: 'Drill your 2 Philidor Defense mistakes',
    }),
  ).toBeInTheDocument();
  expect(screen.getByText('Drill 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Opening' })).toHaveValue(
    'Philidor Defense',
  );
});

test('the links can be reached and used with the keyboard', async () => {
  localStorage.setItem('lastUsername', 'paul morphy');
  const user = userEvent.setup();
  openOverview(await savedStore());

  const link = await screen.findByRole('link', {
    name: '1 drill for middlegame mistakes',
  });
  link.focus();
  expect(link).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(location.hash).toBe('#/drill?stage=middlegame');
});
