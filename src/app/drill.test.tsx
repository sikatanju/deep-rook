import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { drag } from '@/components/board/drag.testing';
import { memoryStore } from '@/lib/analysis/cache';
import {
  memoryProgress,
  type ProgressStore,
} from '@/lib/analysis/drill-progress';
import { dayOf } from '@/lib/analysis/drill-streak';
import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';
import { parseReplay } from '@/lib/chess/replay';

import App from './App';

const BLACK = 'Duke Karl / Count Isouard';

// Black's two drills, costliest first: 4...Bxf3 (the engine wanted dxe5),
// then 7...Qe7 (it wanted Nc6).
async function openDrill(
  username: string | null = BLACK,
  records = 1,
  progress: ProgressStore | null = memoryProgress(),
) {
  const store = memoryStore();
  if (records) await store.save(stored({ ...OPERA_SLIPS, level: 'fast' }));
  if (username) localStorage.setItem('lastUsername', username);
  location.hash = '#/drill';
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
  expect(screen.queryByText(/blunder/i)).toBeNull();
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

test('Enter moves on after a solve, but not while typing a move', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');

  // Enter in the field submits the move; it does not also skip ahead.
  await user.type(screen.getByLabelText('Type your move'), 'dxe5{Enter}');
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

test('a typed move is judged, and illegal text is not a try', async () => {
  const user = await openDrill();
  await screen.findByText('Drill 1 of 2');
  const field = screen.getByLabelText('Type your move');

  await user.type(field, 'Ke5{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'That is not a legal move here.',
  );
  expect(screen.queryByText("Not the engine's first choice.")).toBeNull();

  await user.clear(field);
  await user.type(field, 'dxe5');
  await user.click(screen.getByRole('button', { name: 'Play' }));
  expect(screen.getByText('You found it.')).toBeInTheDocument();

  // Solved with no counted try: the summary calls it a first-try solve.
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

test('dragging the best piece to its square solves the drill', async () => {
  await openDrill();
  await screen.findByText('Drill 1 of 2');

  drag('d6', 'e5', { flipped: true });
  expect(await screen.findByText('You found it.')).toBeInTheDocument();
  expect(screen.getByText('4… Bxf3')).toBeInTheDocument();
});

test('a drag lights the legal targets, and dropping elsewhere plays nothing', async () => {
  await openDrill();
  await screen.findByText('Drill 1 of 2');

  drag('d6', 'a1', { flipped: true });
  expect(screen.queryByText('You found it.')).toBeNull();
  expect(screen.queryByText("Not the engine's first choice.")).toBeNull();
  // The piece is home and still selected: its targets stay lit for a click.
  expect(
    document.querySelector('[data-square="e5"] [data-target]'),
  ).not.toBeNull();
  expect(
    document.querySelector('[data-square="d6"] [data-piece="bP"]'),
  ).not.toBeNull();

  drag('d6', { x: -40, y: 300 }, { flipped: true });
  expect(screen.queryByText('You found it.')).toBeNull();

  // Click-to-move still finishes the move.
  await userEvent.setup().click(square(/^e5/));
  expect(screen.getByText('You found it.')).toBeInTheDocument();
});

test('a pawn dragged to the last rank asks for the piece, as a click does', async () => {
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
  drag('a7', 'a8');
  const picker = screen.getByRole('group', { name: 'Promote to' });
  expect(screen.queryByText('You found it.')).toBeNull();

  await user.click(within(picker).getByRole('button', { name: 'Queen' }));
  expect(await screen.findByText('You found it.')).toBeInTheDocument();
});
