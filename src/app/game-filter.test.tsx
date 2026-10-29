import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { stored } from '@/lib/analysis/fixtures';
import { parseReplay } from '@/lib/chess/replay';
import { PAGE_SIZE } from '@/lib/lichess/api';
import { BLITZ, DRAW, ndjson } from '@/lib/lichess/fixtures';

import App from './App';

afterEach(() => {
  document.cookie = 'settings=; Path=/; Max-Age=0';
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Spec = {
  speed: 'bullet' | 'blitz' | 'rapid';
  result: 'win' | 'loss' | 'draw';
};

// Newest first once listed: Rival1 is the latest game.
const SPECS: Spec[] = [
  { speed: 'rapid', result: 'loss' },
  { speed: 'rapid', result: 'win' },
  { speed: 'blitz', result: 'loss' },
  { speed: 'blitz', result: 'win' },
  { speed: 'blitz', result: 'draw' },
  { speed: 'bullet', result: 'draw' },
];
const MOVES = [
  '1. e4 e5 2. Nf3',
  '1. d4 d5 2. c4',
  '1. c4 e5 2. Nc3',
  '1. Nf3 d5 2. g3',
  '1. b3 e5 2. Bb2',
  '1. g3 d5 2. Bg2',
];
const TIME_CONTROL = { bullet: '60', blitz: '180', rapid: '600' };
const link = (n: number) => `https://www.chess.com/game/live/${n}`;
const pgn = (n: number) =>
  `[White "Me"]\n[Black "Rival${n}"]\n[Link "${link(n)}"]\n\n${MOVES[n - 1]} *`;

function stubChessCom(specs: Spec[] = SPECS) {
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body)));
  const game = ({ speed, result }: Spec, i: number) => {
    const n = i + 1;
    return {
      url: link(n),
      pgn: pgn(n),
      end_time: 1735949652 + (specs.length - n) * 60,
      time_control: TIME_CONTROL[speed],
      time_class: speed,
      rules: 'chess',
      rated: true,
      white: {
        username: 'Me',
        rating: 1500,
        result:
          result === 'win' ? 'win' : result === 'loss' ? 'resigned' : 'agreed',
      },
      black: {
        username: `Rival${n}`,
        rating: 1490,
        result:
          result === 'loss' ? 'win' : result === 'win' ? 'resigned' : 'agreed',
      },
    };
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/games/archives'))
        return json({ archives: ['https://x/pub/player/me/games/2025/01'] });
      if (url.includes('/games/2025/01'))
        return json({ games: specs.map(game) });
      return json({ username: 'Me', joined: 1 });
    }),
  );
}

async function openChessCom(store = memoryStore()) {
  const user = userEvent.setup();
  render(<App store={store} />);
  await user.type(screen.getByLabelText('Chess.com username'), 'Me');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  await screen.findByRole('button', { name: /Rival1\b/ });
  return user;
}

const chip = (group: string, name: string) =>
  within(screen.getByRole('group', { name: group })).getByRole('button', {
    name,
  });
const listed = () =>
  SPECS.map((_, i) => i + 1).filter((n) =>
    screen.queryByRole('button', { name: new RegExp(`Rival${n}\\b`) }),
  );
const panel = () =>
  screen.getByRole('heading', { name: 'Review in bulk' }).parentElement!
    .parentElement!;

test('time-control and result chips sit above the list, offering the speeds listed', async () => {
  stubChessCom();
  await openChessCom();

  const speeds = within(screen.getByRole('group', { name: 'Time control' }));
  expect(speeds.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Any speed',
    'Bullet',
    'Blitz',
    'Rapid',
  ]);
  const results = within(screen.getByRole('group', { name: 'Result' }));
  expect(results.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Any result',
    'Win',
    'Loss',
    'Draw',
  ]);
  expect(chip('Time control', 'Any speed')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(listed()).toEqual([1, 2, 3, 4, 5, 6]);
});

test('the time-control chip lists only that speed', async () => {
  stubChessCom();
  const user = await openChessCom();

  await user.click(chip('Time control', 'Blitz'));
  expect(listed()).toEqual([3, 4, 5]);
  expect(chip('Time control', 'Blitz')).toHaveAttribute('aria-pressed', 'true');
  await user.click(chip('Time control', 'Any speed'));
  expect(listed()).toEqual([1, 2, 3, 4, 5, 6]);
});

test('the result chip lists only wins, losses or draws, from the searched side', async () => {
  stubChessCom();
  const user = await openChessCom();

  await user.click(chip('Result', 'Win'));
  expect(listed()).toEqual([2, 4]);
  await user.click(chip('Result', 'Loss'));
  expect(listed()).toEqual([1, 3]);
  await user.click(chip('Result', 'Draw'));
  expect(listed()).toEqual([5, 6]);
});

test('both chips together narrow the list, and an empty result offers to clear them', async () => {
  stubChessCom();
  const user = await openChessCom();

  await user.click(chip('Time control', 'Blitz'));
  await user.click(chip('Result', 'Loss'));
  expect(listed()).toEqual([3]);

  await user.click(chip('Time control', 'Rapid'));
  await user.click(chip('Result', 'Draw'));
  expect(listed()).toEqual([]);
  expect(screen.getByText('No games match these filters.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(listed()).toEqual([1, 2, 3, 4, 5, 6]);
  expect(
    screen.queryByText('No games match these filters.'),
  ).not.toBeInTheDocument();
  expect(chip('Result', 'Any result')).toHaveAttribute('aria-pressed', 'true');
});

test('the batch takes its latest N from the games that pass the filters, then losses only', async () => {
  stubChessCom();
  const user = await openChessCom();
  const bulk = () => within(panel());

  expect(
    await bulk().findByRole('button', { name: 'Analyze 6 games' }),
  ).toBeInTheDocument();

  await user.click(chip('Time control', 'Blitz'));
  expect(
    bulk().getByRole('button', { name: 'Analyze 3 games' }),
  ).toBeInTheDocument();

  await user.click(chip('Result', 'Win'));
  expect(
    bulk().getByRole('button', { name: 'Analyze 1 game' }),
  ).toBeInTheDocument();

  // Losses only comes after the filters: none of the blitz wins is a loss.
  await user.click(bulk().getByRole('checkbox', { name: 'Losses only' }));
  expect(
    bulk().getByRole('button', { name: 'Analyze 0 games' }),
  ).toBeDisabled();
  expect(
    bulk().getByText('No losses found among the games that pass the filters.'),
  ).toBeInTheDocument();

  await user.click(chip('Result', 'Any result'));
  expect(
    bulk().getByRole('button', { name: 'Analyze 1 game' }),
  ).toBeInTheDocument();
  expect(
    bulk().getByText(
      /Found 1 loss among the games that pass the filters, fewer than 10\./,
    ),
  ).toBeInTheDocument();
});

test('the count is taken after filtering, not before', async () => {
  // 4 rapid games newest, then 8 blitz: the latest 5 of the list hold 4 rapid
  // games, the latest 5 blitz games are all blitz.
  const many: Spec[] = [
    ...Array.from(
      { length: 4 },
      () => ({ speed: 'rapid', result: 'win' }) as Spec,
    ),
    ...Array.from(
      { length: 8 },
      () => ({ speed: 'blitz', result: 'win' }) as Spec,
    ),
  ];
  stubChessCom(many);
  // Each of the four newest rapid games is saved already.
  const store = memoryStore();
  for (const n of [1, 2, 3, 4])
    await store.save(
      stored({
        replay: parseReplay(
          `[White "Me"]\n[Black "Rival${n}"]\n[Link "${link(n)}"]\n\n${MOVES[n - 1]} *`,
        ),
      }),
    );
  const user = await openChessCom(store);
  const bulk = () => within(panel());
  await user.click(await bulk().findByRole('radio', { name: /^5/ }));
  expect(
    await bulk().findByText(/^1 game to analyze\. 4 already reviewed/),
  ).toBeInTheDocument();

  await user.click(chip('Time control', 'Blitz'));
  expect(
    bulk().getByText(/^5 games to analyze\. 0 already reviewed/),
  ).toBeInTheDocument();
});

test('the chips filter a Lichess list too, including games loaded later', async () => {
  const first = Array.from({ length: PAGE_SIZE }, (_, i) => ({
    ...BLITZ,
    id: `g${i}`,
    createdAt: BLITZ.createdAt - i * 1000,
    lastMoveAt: BLITZ.lastMoveAt - i * 1000,
  }));
  const pages = [
    ndjson(...first),
    ndjson(first.at(-1)!, { ...DRAW, id: 'older' }),
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(pages.shift() ?? ''))),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('radio', { name: 'Lichess' }));
  await user.type(screen.getByLabelText('Lichess username'), 'thibault');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  await screen.findAllByRole('button', { name: /krevermann/ });

  await user.click(chip('Result', 'Draw'));
  expect(screen.getByText('No games match these filters.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Load older games' }));
  expect(
    await screen.findByRole('button', { name: /Martin99991/ }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /krevermann/ })).toBeNull();
  expect(screen.queryByText('No games match these filters.')).toBeNull();

  await user.click(chip('Result', 'Win'));
  expect(screen.queryByRole('button', { name: /Martin99991/ })).toBeNull();
  expect(screen.getAllByRole('button', { name: /krevermann/ })).toHaveLength(
    PAGE_SIZE,
  );
});
