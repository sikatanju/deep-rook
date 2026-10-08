import { expect, test } from 'vitest';

import { ChessComError } from '@/lib/chesscom/errors';
import type { Game, Profile } from '@/lib/chesscom/types';

import { pickerReducer, type PickerState } from './use-game-picker';

const profile: Profile = { username: 'hikaru', joined: new Date(0) };
const game = { id: 'g1' } as Game;

const loading: PickerState = { status: 'loading', username: 'hikaru' };
const ready = pickerReducer(loading, {
  type: 'ready',
  profile,
  months: ['2025-01', '2024-12'],
  month: '2025-01',
});

test('search -> ready starts with games loading and nothing selected', () => {
  expect(ready).toMatchObject({
    status: 'ready',
    month: '2025-01',
    games: { kind: 'loading' },
    selected: null,
  });
});

test('failure while loading becomes an error that keeps the username', () => {
  const err = new ChessComError('not-found');
  expect(pickerReducer(loading, { type: 'failed', error: err })).toEqual({
    status: 'error',
    username: 'hikaru',
    error: err,
  });
});

test('changing month resets games and selection', () => {
  const picked = pickerReducer(ready, { type: 'select', game });
  const next = pickerReducer(picked, { type: 'month', month: '2024-12' });
  expect(next).toMatchObject({
    month: '2024-12',
    games: { kind: 'loading' },
    selected: null,
  });
});

test('a late result after a new search is ignored', () => {
  const searching = pickerReducer(ready, {
    type: 'search',
    username: 'magnus',
  });
  expect(
    pickerReducer(searching, {
      type: 'games',
      games: { kind: 'loaded', games: [] },
    }),
  ).toBe(searching);
  expect(pickerReducer(searching, { type: 'select', game })).toBe(searching);
});
