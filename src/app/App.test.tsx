import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import App from './App';

afterEach(() => vi.unstubAllGlobals());

test('renders the app shell with the username form', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'DeepRook' })).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: /Pick a game to roast/ }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Chess.com username')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Find games' })).toBeDisabled();
});

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

test('the sidebar can be collapsed and expanded', async () => {
  const user = userEvent.setup();
  render(<App />);
  const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await user.click(toggle);
  expect(
    screen.getByRole('button', { name: 'Expand sidebar' }),
  ).toHaveAttribute('aria-expanded', 'false');
  // Collapsed links keep their names for screen readers.
  expect(screen.getByRole('link', { name: 'Games' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
  expect(
    screen.getByRole('button', { name: 'Collapse sidebar' }),
  ).toBeInTheDocument();
});

test('the sidebar starts collapsed when the screen is not roomy', () => {
  stubMatchMedia(false);
  render(<App />);
  expect(
    screen.getByRole('button', { name: 'Expand sidebar' }),
  ).toBeInTheDocument();
});

function stubChessCom() {
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body)));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/games/archives'))
        return json({ archives: ['https://x/pub/player/me/games/2025/01'] });
      if (url.includes('/games/2025/01'))
        return json({
          games: [
            {
              url: 'https://www.chess.com/game/live/1',
              pgn: '[White "Me"]\n[Black "Rival"]\n\n1. e4 e5',
              end_time: 1735949652,
              time_control: '180',
              time_class: 'blitz',
              rules: 'chess',
              rated: true,
              white: { username: 'Me', rating: 1500, result: 'win' },
              black: { username: 'Rival', rating: 1490, result: 'resigned' },
            },
          ],
        });
      return json({ username: 'Me', joined: 1 });
    }),
  );
}

async function findGameRow() {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Chess.com username'), 'Me');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  return { user, row: await screen.findByRole('button', { name: /Rival/ }) };
}

test('lists games for a user and opens one in the review page', async () => {
  stubChessCom();
  const { user, row } = await findGameRow();
  await user.click(row);
  await user.click(screen.getByRole('button', { name: 'Review game' }));
  expect(
    await screen.findByRole('group', { name: /Chess board/ }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('group', { name: 'Black player' })).getByText(
      'Rival',
    ),
  ).toBeInTheDocument();
});

test('picking a game row only stages it until Review game is pressed', async () => {
  stubChessCom();
  const { user, row } = await findGameRow();
  await user.click(row);

  expect(row).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Me vs Rival')).toBeInTheDocument();
  expect(screen.getByText('2 moves')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review' })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.queryByRole('group', { name: /Chess board/ })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Review game' }));
  expect(
    await screen.findByRole('group', { name: /Chess board/ }),
  ).toBeInTheDocument();
});

test('shows a message when the user does not exist', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Chess.com username'), 'nobody');
  await user.click(screen.getByRole('button', { name: 'Find games' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No Chess.com player',
  );
});

test('choosing a palette sets data-theme and is remembered', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(document.documentElement.dataset.theme).toBe('pop');
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Arcade Night' }));
  expect(document.documentElement.dataset.theme).toBe('arcade');
  const saved = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('settings='));
  expect(
    JSON.parse(decodeURIComponent(saved!.slice('settings='.length))),
  ).toMatchObject({
    palette: 'arcade',
  });
  expect(localStorage.getItem('settings')).toBeNull();
});

function stubLosingDay() {
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body)));
  const lost = (n: number) => ({
    url: `https://www.chess.com/game/live/${n}`,
    pgn: `[White "Me"]\n[Black "Rival${n}"]\n\n1. e4 e5`,
    end_time: 1735949652 + n * 60,
    time_control: '60',
    time_class: 'bullet',
    rules: 'chess',
    rated: true,
    white: { username: 'Me', rating: 1500 - n, result: 'resigned' },
    black: { username: `Rival${n}`, rating: 1490, result: 'win' },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/games/archives'))
        return json({ archives: ['https://x/pub/player/me/games/2025/01'] });
      if (url.includes('/games/2025/01'))
        return json({ games: [lost(1), lost(2), lost(3)] });
      return json({ username: 'Me', joined: 1 });
    }),
  );
}

test('three straight losses get a coach word, and Review last loss stages the latest', async () => {
  stubLosingDay();
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Chess.com username'), 'Me');
  await user.click(screen.getByRole('button', { name: 'Find games' }));

  const coach = await screen.findByRole('region', { name: 'Coach' });
  expect(coach).toHaveTextContent('3 losses in a row');
  await user.click(screen.getByRole('button', { name: 'Review last loss' }));

  expect(screen.getByText('Me vs Rival3')).toBeInTheDocument();
  expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
  localStorage.clear();
});

test('a single loss draws no coach', async () => {
  stubChessCom();
  await findGameRow();
  expect(screen.queryByRole('region', { name: 'Coach' })).toBeNull();
});
