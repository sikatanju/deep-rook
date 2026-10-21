import { expect, test } from 'vitest';

import type { Game } from '@/lib/chesscom/types';
import { LichessError } from '@/lib/lichess/errors';

import {
  lichessReducer,
  type LichessAction,
  type LichessState,
} from './use-lichess-picker';

const game = (id: string) => ({ id }) as Game;

const loading: LichessState = { status: 'loading', username: 'thibault' };
const ready = lichessReducer(loading, {
  type: 'page',
  page: { games: [game('a'), game('b')], next: 100 },
});

const ids = (s: LichessState) =>
  s.status === 'ready' ? s.games.map((g) => g.id) : null;

test('the first page makes the picker ready with nothing selected', () => {
  expect(ready).toMatchObject({
    status: 'ready',
    username: 'thibault',
    next: 100,
    older: { kind: 'idle' },
    selected: null,
  });
  expect(ids(ready)).toEqual(['a', 'b']);
});

test('failure while loading becomes an error that keeps the username', () => {
  const error = new LichessError('not-found');
  expect(lichessReducer(loading, { type: 'failed', error })).toEqual({
    status: 'error',
    username: 'thibault',
    error,
  });
});

test('an older page appends after the loaded games, without repeats', () => {
  const picked = lichessReducer(ready, { type: 'select', game: game('a') });
  const waiting = lichessReducer(picked, { type: 'older' });
  expect(waiting).toMatchObject({ older: { kind: 'loading' } });
  const more = lichessReducer(waiting, {
    type: 'page',
    page: { games: [game('b'), game('c')], next: null },
  });
  expect(ids(more)).toEqual(['a', 'b', 'c']);
  expect(more).toMatchObject({
    next: null,
    older: { kind: 'idle' },
    selected: { id: 'a' },
  });
});

test('no older page is asked for at the end or while one is loading', () => {
  const end = lichessReducer(loading, {
    type: 'page',
    page: { games: [], next: null },
  });
  expect(lichessReducer(end, { type: 'older' })).toBe(end);
  const waiting = lichessReducer(ready, { type: 'older' });
  expect(lichessReducer(waiting, { type: 'older' })).toBe(waiting);
});

test('a failed older page keeps the games and can be retried', () => {
  const error = new LichessError('rate-limited');
  const failed = lichessReducer(lichessReducer(ready, { type: 'older' }), {
    type: 'olderFailed',
    error,
  });
  expect(failed).toMatchObject({ older: { kind: 'error', error } });
  expect(ids(failed)).toEqual(['a', 'b']);
  expect(lichessReducer(failed, { type: 'older' })).toMatchObject({
    older: { kind: 'loading' },
  });
});

test('a page nobody asked for changes nothing', () => {
  const stray: LichessAction = {
    type: 'page',
    page: { games: [game('z')], next: 1 },
  };
  expect(lichessReducer(ready, stray)).toBe(ready);
  const searching = lichessReducer(ready, { type: 'search', username: 'x' });
  expect(lichessReducer(searching, { type: 'select', game: game('a') })).toBe(
    searching,
  );
});
