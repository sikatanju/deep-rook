import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { PAGE_SIZE } from '@/lib/lichess/api';
import { BLITZ, DRAW, ndjson } from '@/lib/lichess/fixtures';

import App from './App';

afterEach(() => vi.unstubAllGlobals());

function stubLichess(...pages: string[]) {
  const fetchMock = vi.fn((url: string) => {
    expect(url).toMatch(/^https:\/\/lichess\.org\/api\/games\/user\//);
    const body = pages.shift();
    return Promise.resolve(
      body === undefined
        ? new Response('{"error":"Not found"}', { status: 404 })
        : new Response(body),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function searchLichess(name = 'thibault') {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('radio', { name: 'Lichess' }));
  await user.type(screen.getByLabelText('Lichess username'), name);
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  return user;
}

const rows = () => screen.queryAllByRole('button', { pressed: false });

test('a Lichess game stages like a Chess.com one, from the searched side', async () => {
  stubLichess(ndjson(BLITZ, DRAW));
  const user = await searchLichess('ThiBault');

  const row = await screen.findByRole('button', { name: /krevermann/ });
  expect(screen.getByRole('button', { name: /Martin99991/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Load older games' })).toBeNull();

  await user.click(row);
  expect(row).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('krevermann vs thibault')).toBeInTheDocument();
  expect(screen.getByText('10 moves')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Review game' }));
  expect(
    await screen.findByRole('group', { name: /black at the bottom/ }),
  ).toBeInTheDocument();
});

test('Load older games appends the next page without repeats', async () => {
  const first = Array.from({ length: PAGE_SIZE }, (_, i) => ({
    ...BLITZ,
    id: `g${i}`,
    createdAt: BLITZ.createdAt - i * 1000,
    lastMoveAt: BLITZ.lastMoveAt - i * 1000,
  }));
  const fetchMock = stubLichess(
    ndjson(...first),
    ndjson(first.at(-1)!, { ...DRAW, id: 'older' }),
  );
  const user = await searchLichess();

  await user.click(
    await screen.findByRole('button', { name: 'Load older games' }),
  );
  expect(
    await screen.findByRole('button', { name: /Martin99991/ }),
  ).toBeInTheDocument();
  expect(rows()).toHaveLength(PAGE_SIZE + 1);
  expect(new URL(fetchMock.mock.calls[1]![0]).searchParams.get('until')).toBe(
    String(first.at(-1)!.createdAt),
  );
  // A short page is the last one.
  expect(screen.queryByRole('button', { name: 'Load older games' })).toBeNull();
});

test('an unknown Lichess player gets a Lichess error', async () => {
  stubLichess();
  await searchLichess('nobody');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No Lichess player with that username.',
  );
});

test('a failed older page says so and keeps the games', async () => {
  const first = Array.from({ length: PAGE_SIZE }, (_, i) => ({
    ...BLITZ,
    id: `g${i}`,
  }));
  stubLichess(ndjson(...first));
  const user = await searchLichess();
  await user.click(
    await screen.findByRole('button', { name: 'Load older games' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No Lichess player',
  );
  expect(rows()).toHaveLength(PAGE_SIZE);
  expect(
    screen.getByRole('button', { name: 'Load older games' }),
  ).toBeEnabled();
});

test('each site keeps its own last username', async () => {
  localStorage.setItem('lastUsername', 'hikaru');
  stubLichess(ndjson(BLITZ));
  const user = await searchLichess();
  await screen.findByRole('button', { name: /krevermann/ });
  expect(localStorage.getItem('lastLichessUsername')).toBe('thibault');

  await user.click(screen.getByRole('radio', { name: 'Chess.com' }));
  expect(screen.getByLabelText('Chess.com username')).toHaveValue('hikaru');
  await user.click(screen.getByRole('radio', { name: 'Lichess' }));
  expect(screen.getByLabelText('Lichess username')).toHaveValue('thibault');
  expect(localStorage.getItem('lastUsername')).toBe('hikaru');
});

test('the source switch is a radio group the arrow keys move through', async () => {
  const user = userEvent.setup();
  render(<App />);
  const group = screen.getByRole('group', { name: 'Game source' });
  expect(group).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Chess.com' })).toBeChecked();

  await user.click(screen.getByRole('radio', { name: 'Chess.com' }));
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('radio', { name: 'Lichess' })).toBeChecked();
  expect(screen.getByLabelText('Lichess username')).toBeInTheDocument();
  expect(screen.queryByLabelText('Chess.com username')).toBeNull();
});

test('three straight Lichess losses get the coach too', async () => {
  const lost = [1, 2, 3].map((n) => ({
    ...BLITZ,
    id: `l${n}`,
    lastMoveAt: BLITZ.lastMoveAt - n * 60_000,
    winner: 'white',
  }));
  stubLichess(ndjson(...lost));
  const user = await searchLichess();

  const coach = await screen.findByRole('region', { name: 'Coach' });
  expect(coach).toHaveTextContent('3 losses in a row');
  await user.click(screen.getByRole('button', { name: 'Review last loss' }));
  expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
  expect(screen.getByText('krevermann vs thibault')).toBeInTheDocument();
});

test('loading a PGN clears the staged Lichess row', async () => {
  stubLichess(ndjson(BLITZ));
  const user = await searchLichess();
  const row = await screen.findByRole('button', { name: /krevermann/ });
  await user.click(row);
  expect(row).toHaveAttribute('aria-pressed', 'true');

  await user.type(screen.getByLabelText('PGN'), '1. e4 e5');
  await user.click(screen.getByRole('button', { name: 'Load PGN' }));
  expect(row).toHaveAttribute('aria-pressed', 'false');
});
