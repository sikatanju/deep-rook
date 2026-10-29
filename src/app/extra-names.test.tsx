import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { memoryProgress } from '@/lib/analysis/drill-progress';
import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';

import App from './App';

const BLACK = 'Duke Karl / Count Isouard';

async function openSettings() {
  const store = memoryStore();
  await store.save(stored({ ...OPERA_SLIPS, level: 'fast' }));
  location.hash = '#/settings';
  render(<App store={store} progress={memoryProgress()} />);
  return userEvent.setup();
}

async function addName(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByRole('textbox', { name: 'Extra name' }), name);
  await user.click(screen.getByRole('button', { name: 'Add name' }));
}

test('an extra name makes a game the player’s on Overview and Drill, without a reload', async () => {
  const user = await openSettings();
  await user.click(screen.getByRole('link', { name: 'Overview' }));
  expect(
    await screen.findByText('None of these games are yours.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/or by an extra name added in Settings/),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: 'Settings' }));
  await addName(user, `  ${BLACK.toUpperCase()}  `);
  expect(screen.getByText(BLACK.toUpperCase())).toBeInTheDocument();

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

test('a name that matches no player changes nothing, and removing a name takes the games back', async () => {
  const user = await openSettings();
  await addName(user, 'Somebody Else');
  await user.click(screen.getByRole('link', { name: 'Overview' }));
  expect(
    await screen.findByText('None of these games are yours.'),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: 'Settings' }));
  await addName(user, BLACK);
  await user.click(screen.getByRole('link', { name: 'Overview' }));
  expect(
    await screen.findByRole('img', { name: /^Accuracy over your last 1 game/ }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: `Remove ${BLACK}` }));
  await user.click(screen.getByRole('link', { name: 'Overview' }));
  expect(
    await screen.findByText('None of these games are yours.'),
  ).toBeInTheDocument();
});

test('adding the same name twice, or a blank one, lists it once', async () => {
  const user = await openSettings();
  await addName(user, 'Paul');
  await addName(user, ' paul ');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Add name' })).toBeDisabled();
});
