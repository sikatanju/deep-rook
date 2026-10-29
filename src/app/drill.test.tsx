import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import {
  memoryProgress,
  type ProgressStore,
} from '@/lib/analysis/drill-progress';
import { dayOf } from '@/lib/analysis/drill-streak';
import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import App from './App';

const BLACK = 'Duke Karl / Count Isouard';

// Black's two drills, costliest first: 4...Bxf3 (the engine wanted dxe5),
// then 7...Qe7 (it wanted Nc6).
async function openDrill(
  username: string | null = BLACK,
  records = 1,
  progress: ProgressStore | null = memoryProgress(),
  hash = '#/drill',
) {
  const store = memoryStore();
  if (records) await store.save(stored({ ...OPERA_SLIPS, level: 'fast' }));
  if (username) localStorage.setItem('lastUsername', username);
  location.hash = hash;
  const view = render(<App store={store} progress={progress} />);
  return Object.assign(userEvent.setup(), { view, store, progress });
}

const square = (name: RegExp | string) => screen.getByRole('button', { name });

async function play(
  user: ReturnType<typeof userEvent.setup>,
  from: RegExp,
  to: RegExp,
) {
  await user.click(square(from));
  await user.click(square(to));
}

test('with nothing reviewed the coach says so', async () => {
  const user = await openDrill(BLACK, 0);
  expect(await screen.findByText('Nothing reviewed yet.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Pick a game' }));
  expect(screen.getByRole('link', { name: 'Games' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('with no game matching the username it points to the Games page', async () => {
  await openDrill(null);
  expect(
    await screen.findByText('None of these games are yours.'),
  ).toBeInTheDocument();
  expect(screen.getByText(/Load yours on the Games page/)).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Go to Games' }),
  ).toBeInTheDocument();
});

test('a saved Lichess username finds the drills too', async () => {
  localStorage.setItem('lastLichessUsername', BLACK);
  await openDrill(null);
  expect(await screen.findByText('Drill 1 of 2')).toBeInTheDocument();
});

test('a player with no mistakes gets a clean sheet', async () => {
  await openDrill('paul morphy');
  expect(await screen.findByText('Clean sheet.')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /Chess board/ })).toBeNull();
});

test('the first drill asks for a move without giving the answer away', async () => {
  await openDrill();
  expect(await screen.findByText('Drill 1 of 2')).toBeInTheDocument();
  expect(
    screen.getByText(
      "Move 4, your game vs Paul Morphy. Black to move. Find the engine's move, or one nearly as good.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('group', { name: /black at the bottom/ }),
  ).toBeInTheDocument();
  // The bishop still stands on g4: the position is before the mistake.
  expect(square('g4, black bishop')).toBeInTheDocument();
  expect(screen.queryByText(/Bxf3/)).toBeNull();
  // The grade filter's chip names it, but nothing says this drill is one.
  expect(
    screen.queryAllByText(/blunder/i).filter((el) => !el.closest('button')),
  ).toEqual([]);
  expect(document.querySelector('[data-grade]')).toBeNull();
  expect(document.querySelector('[data-arrow]')).toBeNull();
});

test('a wrong click gives the verdict and keeps the board playable', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');

  await play(user, /^g4/, /^f3/);
  expect(screen.getByText('That is the move you played.')).toBeInTheDocument();
  expect(
    screen.getByText(
      "Bxf3 gives up 31.3 points of winning chances. The engine's move, or one nearly as good, solves it.",
    ),
  ).toBeInTheDocument();

  // No engine here to check it, so a move the saved lines cannot judge falls short.
  await play(user, /^g8/, /^f6/);
  expect(
    await screen.findByText("Not the engine's first choice."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Show answer' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();

  await play(user, /^d6/, /^e5/);
  expect(screen.getByText('You found it.')).toBeInTheDocument();
});

test('the best move solves the drill and reveals what was played', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');

  await user.click(square(/^d6/));
  expect(
    document.querySelector('[data-square="e5"] [data-target]'),
  ).not.toBeNull();
  await user.click(square(/^e5/));

  expect(screen.getByText('You found it.')).toBeInTheDocument();
  expect(screen.getByText('4… Bxf3')).toBeInTheDocument();
  expect(
    screen.getByText(/You played Bxf3, which cost 31\.3 points/),
  ).toBeInTheDocument();
  expect(screen.getByText(/4… dxe5 5\. Qxd8\+ Kxd8/)).toBeInTheDocument();
  expect(document.querySelector('[data-arrow="d6e5"]')).not.toBeNull();
  expect(screen.queryByRole('group', { name: /Chess board/ })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Next drill' }));
  expect(screen.getByText('Drill 2 of 2')).toBeInTheDocument();
  expect(
    screen.getByText(/^Move 7, your game vs Paul Morphy/),
  ).toBeInTheDocument();
});

test('Enter moves on once a drill is settled', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');

  await play(user, /^d6/, /^e5/);
  expect(screen.getByText('You found it.')).toBeInTheDocument();
  expect(screen.getByText('Drill 1 of 2')).toBeInTheDocument();

  await user.keyboard('{Enter}');
  expect(screen.getByText('Drill 2 of 2')).toBeInTheDocument();
  // Not settled yet: Enter does nothing.
  await user.keyboard('{Enter}');
  expect(screen.getByText('Drill 2 of 2')).toBeInTheDocument();
});

test('the rail counts the drills that are due, except on the drill page', async () => {
  const store = memoryStore();
  await store.save(stored({ ...OPERA_SLIPS, level: 'fast' }));
  localStorage.setItem('lastUsername', BLACK);
  location.hash = '#/games';
  render(<App store={store} progress={memoryProgress()} />);
  expect(
    await screen.findByRole('link', { name: 'Drill, 2 due' }),
  ).toBeInTheDocument();

  location.hash = '#/drill';
  expect(await screen.findByText('Drill 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Drill' })).toBeInTheDocument();
});

test('a solved first try counts in the summary', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');

  await play(user, /^d6/, /^e5/);
  await user.click(screen.getByRole('button', { name: 'Next drill' }));
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(
    screen.getByText('Solved first try 1, after retries 0, shown 0, skipped 1'),
  ).toBeInTheDocument();
});

test('Show answer reveals the engine move', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText("Here is the engine's move.")).toBeInTheDocument();
  expect(screen.getByText('dxe5')).toBeInTheDocument();
  expect(document.querySelector('[data-arrow="d6e5"]')).not.toBeNull();
});

test('finishing the queue shows the summary, and with nowhere to save Start over begins again', async () => {
  const user = await openDrill(BLACK, 1, null);
  await screen.findByText('Drill 1 of 2');

  await play(user, /^g4/, /^f3/);
  await play(user, /^d6/, /^e5/);
  await user.click(screen.getByRole('button', { name: 'Next drill' }));
  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  await user.click(screen.getByRole('button', { name: 'Next drill' }));

  expect(
    screen.getByText('Solved first try 0, after retries 1, shown 1, skipped 0'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Start over' }));
  expect(await screen.findByText('Drill 1 of 2')).toBeInTheDocument();
  expect(screen.getByText(/^Move 4,/)).toBeInTheDocument();
});

test('answers are kept: a missed drill comes back, a solved one rests', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  await play(user, /^d6/, /^e5/);
  await user.click(screen.getByRole('button', { name: 'Next drill' }));
  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  await user.click(screen.getByRole('button', { name: 'Next drill' }));
  expect(
    screen.getByText(/The ones you missed come back next time/),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Start over' }));
  expect(await screen.findByText('Drill 1 of 1')).toBeInTheDocument();
  expect(screen.getByText(/^Move 7,/)).toBeInTheDocument();

  // A later visit remembers too.
  user.view.unmount();
  render(<App store={user.store} progress={user.progress} />);
  expect(await screen.findByText('Drill 1 of 1')).toBeInTheDocument();
  expect(screen.getByText(/^Move 7,/)).toBeInTheDocument();
});

test('a skipped drill is not an answer and stays due', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(screen.getByRole('button', { name: 'Start over' }));
  expect(await screen.findByText('Drill 1 of 2')).toBeInTheDocument();
  expect(await user.progress!.list()).toEqual([]);
});

test('with every drill resting it says when the next is due, and drills anyway on request', async () => {
  const progress = memoryProgress();
  // Both answered just now, so both rest until tomorrow.
  const { key } = stored(OPERA_SLIPS);
  await progress.record(`${key}:8`, 'first-try', Date.now());
  await progress.record(`${key}:14`, 'retry', Date.now());
  const user = await openDrill(BLACK, 1, progress);

  expect(await screen.findByText('All caught up.')).toBeInTheDocument();
  expect(
    screen.getByText(
      /^You have been through every drill\. The next one comes back on /,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/does not move that/)).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /Chess board/ })).toBeNull();

  const before = await progress.list();
  await user.click(screen.getByRole('button', { name: 'Drill them anyway' }));
  expect(screen.getByText('Drill 1 of 2')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  await user.click(screen.getByRole('button', { name: 'Next drill' }));
  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  await user.click(screen.getByRole('button', { name: 'Next drill' }));

  expect(
    screen.getByText('Nothing was saved. They come back on the same day.'),
  ).toBeInTheDocument();
  expect(await progress.list()).toEqual(before);
});

test('Review this game opens the saved game with the player at the bottom', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  await user.click(screen.getByRole('button', { name: 'Review this game' }));

  expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    await screen.findByRole('group', { name: /black at the bottom/ }),
  ).toBeInTheDocument();
  expect(screen.getByText('Fast review')).toBeInTheDocument();
});

test('a promotion asks for the piece before the move is judged', async () => {
  // 1. Kb2 throws away a won pawn ending; the engine queens.
  const replay = parseReplay(`[White "Me"]
[Black "Rival"]
[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]

1. Kb2 Kg7 *`);
  const store = memoryStore();
  await store.save(
    stored({ replay, cps: [900, 100, 100], pvs: { 0: ['a7a8q'] } }),
  );
  localStorage.setItem('lastUsername', 'me');
  location.hash = '#/drill';
  render(<App store={store} />);
  const user = userEvent.setup();

  await screen.findByText('Drill 1 of 1');
  await play(user, /^a7/, /^a8/);
  const picker = screen.getByRole('group', { name: 'Promote to' });
  expect(
    within(picker)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Queen', 'Rook', 'Bishop', 'Knight']);
  expect(screen.queryByText("Not the engine's first choice.")).toBeNull();

  await user.click(within(picker).getByRole('button', { name: 'Knight' }));
  expect(
    await screen.findByText("Not the engine's first choice."),
  ).toBeInTheDocument();

  await play(user, /^a7/, /^a8/);
  await user.click(screen.getByRole('button', { name: 'Queen' }));
  expect(screen.getByText('You found it.')).toBeInTheDocument();
});

test('answering a drill starts a daily streak, and a skip does not', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  expect(screen.queryByText(/in a row/)).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.queryByText(/in a row/)).toBeNull();
  expect(localStorage.getItem('drillStreak')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('1 day in a row')).toBeInTheDocument();
  expect(screen.getByText('Done for today.')).toBeInTheDocument();
});

test('a run that ended yesterday is kept and grows on the first answer today', async () => {
  const day = (back: number) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return dayOf(d.getTime());
  };
  localStorage.setItem('drillStreak', JSON.stringify({ last: day(1), run: 4 }));
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  expect(screen.getByText('4 days in a row')).toBeInTheDocument();
  expect(
    screen.getByText('Answer a drill today to keep it.'),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('5 days in a row')).toBeInTheDocument();

  // Two days ago is a broken run: nothing shows, and the next answer restarts it.
  user.view.unmount();
  localStorage.setItem('drillStreak', JSON.stringify({ last: day(2), run: 9 }));
  const again = await openDrill();
  await screen.findByText('Drill 1 of 2');
  expect(screen.queryByText(/in a row/)).toBeNull();
  await again.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('1 day in a row')).toBeInTheDocument();
});

// Four move orders of the Opera game reach the same positions under a
// different key each, so eight drills are due.
async function openBigDrill() {
  const store = memoryStore();
  const openings = [
    '1. e4 e5 2. Nf3 d6',
    '1. Nf3 d6 2. e4 e5',
    '1. e4 d6 2. Nf3 e5',
    '1. Nf3 e5 2. e4 d6',
  ];
  for (const opening of openings) {
    const replay = parseReplay(
      OPERA_GAME.replace('1. e4 e5 2. Nf3 d6', opening),
    );
    await store.save(stored({ ...OPERA_SLIPS, replay, level: 'fast' }));
  }
  localStorage.setItem('lastUsername', BLACK);
  location.hash = '#/drill';
  render(<App store={store} progress={memoryProgress()} />);
  return userEvent.setup();
}

const choose = (user: ReturnType<typeof userEvent.setup>, size: string) =>
  user.click(screen.getByRole('radio', { name: size }));

test('a capped session takes the top of the queue, and the choice is remembered', async () => {
  const user = await openBigDrill();
  expect(await screen.findByText('Drill 1 of 8')).toBeInTheDocument();
  expect(screen.getByText('8 due')).toBeInTheDocument();

  await choose(user, '5');
  expect(screen.getByText('Drill 1 of 5')).toBeInTheDocument();
  // The costliest first: Black's four blunders, then a mistake.
  expect(screen.getByText(/^Move 4,/)).toBeInTheDocument();
  expect(localStorage.getItem('drillSize')).toBe('5');

  await choose(user, '10');
  expect(screen.getByText('Drill 1 of 8')).toBeInTheDocument();
  await choose(user, '5');

  // Once a drill is answered the size is settled.
  await play(user, /^d6/, /^e5/);
  expect(screen.queryByRole('radio', { name: '10' })).toBeNull();
});

test('a saved size applies on the next visit, and a short queue is taken whole', async () => {
  localStorage.setItem('drillSize', '10');
  await openDrill();
  expect(await screen.findByText('Drill 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '10' })).toBeChecked();
  expect(screen.getByText('2 due')).toBeInTheDocument();
});

test('a capped session ends with a summary, and Keep going takes the next drills', async () => {
  const user = await openBigDrill();
  await screen.findByText('Drill 1 of 8');
  await choose(user, '5');

  for (let i = 0; i < 4; i++) {
    await play(user, /^d6/, /^e5/);
    await user.click(screen.getByRole('button', { name: 'Next drill' }));
  }
  await play(user, /^b8/, /^c6/);
  await user.click(screen.getByRole('button', { name: 'Next drill' }));

  expect(screen.getByText('That is your session.')).toBeInTheDocument();
  expect(
    screen.getByText('Solved first try 5, after retries 0, shown 0, skipped 0'),
  ).toBeInTheDocument();
  expect(screen.getByText('1 day in a row')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Keep going' }));
  expect(await screen.findByText('Drill 1 of 3')).toBeInTheDocument();
  expect(screen.getByText('3 due')).toBeInTheDocument();
});

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed');

test('the grade chips narrow the queue and update the due count', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  expect(screen.getByText('2 due')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Mistake' }));
  expect(screen.getByText('Drill 1 of 1')).toBeInTheDocument();
  expect(screen.getByText('1 due')).toBeInTheDocument();
  expect(screen.getByText(/^Move 7,/)).toBeInTheDocument();
  expect(pressed('Mistake')).toBe('true');
  expect(location.hash).toBe('#/drill?grade=mistake');

  await user.click(screen.getByRole('button', { name: 'Blunder' }));
  expect(screen.getByText(/^Move 4,/)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Any grade' }));
  expect(screen.getByText('Drill 1 of 2')).toBeInTheDocument();
  expect(location.hash).toBe('#/drill');
});

test('the stage chips and the opening list combine with the grade', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');

  // Both slips come early in the game.
  await user.click(screen.getByRole('button', { name: 'Opening' }));
  expect(screen.getByText('Drill 1 of 2')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Blunder' }));
  expect(screen.getByText('Drill 1 of 1')).toBeInTheDocument();
  expect(location.hash).toBe('#/drill?grade=blunder&stage=opening');

  await user.click(screen.getByRole('button', { name: 'Endgame' }));
  expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
});

test('the opening list names the openings played and filters by one', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  const list = screen.getByRole('combobox', { name: 'Opening' });
  const names = within(list)
    .getAllByRole('option')
    .map((o) => o.textContent!);
  expect(names[0]).toBe('Any opening');
  expect(names).toHaveLength(2);

  await user.selectOptions(list, names[1]!);
  expect(screen.getByText('Drill 1 of 2')).toBeInTheDocument();
  expect(location.hash).toContain('opening=');

  await user.click(screen.getByRole('button', { name: 'Mistake' }));
  expect(screen.getByText('Drill 1 of 1')).toBeInTheDocument();
});

test('a query on the drill route sets the filters', async () => {
  await openDrill(
    BLACK,
    1,
    memoryProgress(),
    '#/drill?grade=blunder&stage=opening',
  );
  expect(await screen.findByText('Drill 1 of 1')).toBeInTheDocument();
  expect(screen.getByText(/^Move 4,/)).toBeInTheDocument();
  expect(pressed('Blunder')).toBe('true');
  expect(pressed('Opening')).toBe('true');
  expect(pressed('Any grade')).toBe('false');

  // A link from another page changes it while the page is open.
  location.hash = '#/drill?grade=mistake';
  expect(await screen.findByText(/^Move 7,/)).toBeInTheDocument();
  expect(pressed('Mistake')).toBe('true');
});

test('a filter nothing matches says so, and Clear filters brings the queue back', async () => {
  const user = await openDrill(
    BLACK,
    1,
    memoryProgress(),
    '#/drill?opening=Sicilian%20Defense',
  );
  expect(await screen.findByText('Nothing matches.')).toBeInTheDocument();
  expect(
    screen.getByText('No due drills match these filters.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /Chess board/ })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await screen.findByText('Drill 1 of 2')).toBeInTheDocument();
  expect(location.hash).toBe('#/drill');
});

test('filters combine with the session size', async () => {
  const user = await openBigDrill();
  await screen.findByText('Drill 1 of 8');
  await user.click(screen.getByRole('button', { name: 'Mistake' }));
  expect(screen.getByText('Drill 1 of 4')).toBeInTheDocument();
  expect(screen.getByText('4 due')).toBeInTheDocument();

  await choose(user, '5');
  expect(screen.getByText('Drill 1 of 4')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Any grade' }));
  expect(screen.getByText('Drill 1 of 5')).toBeInTheDocument();
  expect(screen.getByText('8 due')).toBeInTheDocument();
});

test('the side chips filter by the colour played, and the header says what is held', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  expect(
    screen.getByRole('heading', { name: 'Drill your mistakes' }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Black' }));
  expect(screen.getByText('Drill 1 of 2')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Drill your 2 mistakes' }),
  ).toBeInTheDocument();
  expect(location.hash).toBe('#/drill?side=b');

  await user.click(screen.getByRole('button', { name: 'White' }));
  expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Drill your 0 mistakes' }),
  ).toBeInTheDocument();
});

test('the speed chips list the speeds played and filter by one', async () => {
  const store = memoryStore();
  const replay = parseReplay(
    OPERA_GAME.replace('[Result', '[TimeControl "300+3"]\n[Result'),
  );
  await store.save(stored({ ...OPERA_SLIPS, replay, level: 'fast' }));
  localStorage.setItem('lastUsername', BLACK);
  location.hash = '#/drill?speed=blitz&stage=opening&grade=mistake';
  render(<App store={store} progress={memoryProgress()} />);

  expect(await screen.findByText('Drill 1 of 1')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Drill your 1 opening mistake' }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('group', { name: 'Time control' }))
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Any speed', 'Blitz']);
  expect(pressed('Blitz')).toBe('true');

  location.hash = '#/drill?speed=bullet';
  expect(await screen.findByText('Nothing matches.')).toBeInTheDocument();
});

test('the first hint rings the piece to move, without the move or the arrow', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  expect(document.querySelector('[data-hint]')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Hint' }));
  expect(
    document.querySelector('[data-square="d6"] [data-hint]'),
  ).not.toBeNull();
  expect(
    screen.getByText('Hint: the highlighted piece is the one to move.'),
  ).toBeInTheDocument();
  expect(document.querySelector('[data-arrow]')).toBeNull();
  expect(screen.queryByText('dxe5')).toBeNull();
});

test('a line with no theme has a single hint, and Show answer and Skip still work', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  await user.click(screen.getByRole('button', { name: 'Hint' }));
  expect(screen.queryByRole('button', { name: /hint/i })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText("Here is the engine's move.")).toBeInTheDocument();
  expect(document.querySelector('[data-hint]')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Next drill' }));

  await user.click(screen.getByRole('button', { name: 'Hint' }));
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(await screen.findByText('That is every drill.')).toBeInTheDocument();
});

test('a second hint names the theme, never the move', async () => {
  const store = memoryStore();
  await store.save(
    stored({
      replay: parseReplay(`[White "Me"]
[Black "Rival"]
[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]

1. Kb2 Kg7 *`),
      cps: [900, 100, 100],
      pvs: { 0: ['a7a8q'] },
    }),
  );
  localStorage.setItem('lastUsername', 'Me');
  location.hash = '#/drill';
  render(<App store={store} progress={memoryProgress()} />);
  const user = userEvent.setup();
  await screen.findByText('Drill 1 of 1');

  await user.click(screen.getByRole('button', { name: 'Hint' }));
  await user.click(screen.getByRole('button', { name: 'Another hint' }));
  expect(
    screen.getByText('Hint: There is material to win.'),
  ).toBeInTheDocument();
  expect(
    document.querySelector('[data-square="a7"] [data-hint]'),
  ).not.toBeNull();
  expect(screen.queryByRole('button', { name: /hint/i })).toBeNull();
  expect(screen.queryByText(/a8/)).toBeNull();
});

test('a drill solved after a hint counts as a retry and comes back sooner', async () => {
  const progress = memoryProgress();
  const user = await openDrill(BLACK, 1, progress);
  await screen.findByText('Drill 1 of 2');
  await user.click(screen.getByRole('button', { name: 'Hint' }));
  await play(user, /^d6/, /^e5/);
  expect(screen.getByText('You found it.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next drill' }));
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(
    await screen.findByText(/Solved first try 0, after retries 1/),
  ).toBeInTheDocument();
});
