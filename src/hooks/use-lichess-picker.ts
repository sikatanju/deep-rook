import { useCallback, useEffect, useReducer, useRef } from 'react';

import type { Game } from '@/lib/chesscom/types';
import { fetchGames, type GamesPage } from '@/lib/lichess/api';
import { LichessError } from '@/lib/lichess/errors';
import { toLichessUsername } from '@/lib/lichess/types';

export type Older =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: LichessError };

export type LichessState =
  | { status: 'idle' }
  | { status: 'loading'; username: string }
  | { status: 'error'; username: string; error: LichessError }
  | {
      status: 'ready';
      username: string;
      /** Newest first, no id twice. */
      games: Game[];
      /** Cursor for the next, older page; null when there is none. */
      next: number | null;
      older: Older;
      selected: Game | null;
    };

export type LichessAction =
  | { type: 'search'; username: string }
  | { type: 'failed'; error: LichessError }
  | { type: 'page'; page: GamesPage }
  | { type: 'older' }
  | { type: 'olderFailed'; error: LichessError }
  | { type: 'select'; game: Game | null };

export function lichessReducer(
  state: LichessState,
  action: LichessAction,
): LichessState {
  switch (action.type) {
    case 'search':
      return { status: 'loading', username: action.username };
    case 'failed':
      return state.status === 'loading'
        ? { status: 'error', username: state.username, error: action.error }
        : state;
    case 'page': {
      const { games, next } = action.page;
      if (state.status === 'loading')
        return {
          status: 'ready',
          username: state.username,
          games,
          next,
          older: { kind: 'idle' },
          selected: null,
        };
      if (state.status !== 'ready' || state.older.kind !== 'loading')
        return state;
      const seen = new Set(state.games.map((g) => g.id));
      return {
        ...state,
        games: [...state.games, ...games.filter((g) => !seen.has(g.id))],
        next,
        older: { kind: 'idle' },
      };
    }
    case 'older':
      return state.status === 'ready' &&
        state.next !== null &&
        state.older.kind !== 'loading'
        ? { ...state, older: { kind: 'loading' } }
        : state;
    case 'olderFailed':
      return state.status === 'ready' && state.older.kind === 'loading'
        ? { ...state, older: { kind: 'error', error: action.error } }
        : state;
    case 'select':
      return state.status === 'ready'
        ? { ...state, selected: action.game }
        : state;
  }
}

function asLichessError(e: unknown): LichessError {
  return e instanceof LichessError ? e : new LichessError('network');
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export function useLichessPicker() {
  const [state, dispatch] = useReducer(lichessReducer, { status: 'idle' });
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);

  const begin = useCallback(() => {
    ctl.current?.abort();
    ctl.current = new AbortController();
    return ctl.current.signal;
  }, []);

  const search = useCallback(
    async (raw: string) => {
      const user = toLichessUsername(raw);
      if (!user) return;
      const signal = begin();
      dispatch({ type: 'search', username: user });
      try {
        const page = await fetchGames(user, { signal });
        // A body read before a newer search aborted still resolves.
        if (!signal.aborted) dispatch({ type: 'page', page });
      } catch (e) {
        if (isAbort(e)) return;
        dispatch({ type: 'failed', error: asLichessError(e) });
      }
    },
    [begin],
  );

  const loadOlder = useCallback(async () => {
    if (
      state.status !== 'ready' ||
      state.next === null ||
      state.older.kind === 'loading'
    )
      return;
    const signal = begin();
    dispatch({ type: 'older' });
    try {
      const page = await fetchGames(toLichessUsername(state.username), {
        until: state.next,
        signal,
      });
      if (!signal.aborted) dispatch({ type: 'page', page });
    } catch (e) {
      if (isAbort(e)) return;
      dispatch({ type: 'olderFailed', error: asLichessError(e) });
    }
  }, [state, begin]);

  const selectGame = useCallback(
    (game: Game | null) => dispatch({ type: 'select', game }),
    [],
  );

  return { state, search, loadOlder, selectGame };
}
