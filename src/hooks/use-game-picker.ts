import { useCallback, useEffect, useReducer, useRef } from 'react';

import { fetchArchives, fetchMonth, fetchProfile } from '@/lib/chesscom/api';
import { ChessComError } from '@/lib/chesscom/errors';
import {
  toUsername,
  type Game,
  type MonthKey,
  type Profile,
} from '@/lib/chesscom/types';

export type Games =
  | { kind: 'loading' }
  | { kind: 'loaded'; games: Game[] }
  | { kind: 'error'; error: ChessComError };

export type PickerState =
  | { status: 'idle' }
  | { status: 'loading'; username: string }
  | { status: 'error'; username: string; error: ChessComError }
  | {
      status: 'ready';
      profile: Profile;
      months: MonthKey[];
      month: MonthKey;
      games: Games;
      selected: Game | null;
    };

export type PickerAction =
  | { type: 'search'; username: string }
  | { type: 'failed'; error: ChessComError }
  | { type: 'ready'; profile: Profile; months: MonthKey[]; month: MonthKey }
  | { type: 'month'; month: MonthKey }
  | { type: 'games'; games: Games }
  | { type: 'select'; game: Game | null };

export function pickerReducer(
  state: PickerState,
  action: PickerAction,
): PickerState {
  switch (action.type) {
    case 'search':
      return { status: 'loading', username: action.username };
    case 'failed':
      return state.status === 'loading'
        ? { status: 'error', username: state.username, error: action.error }
        : state;
    case 'ready':
      return state.status === 'loading'
        ? {
            status: 'ready',
            profile: action.profile,
            months: action.months,
            month: action.month,
            games: { kind: 'loading' },
            selected: null,
          }
        : state;
    case 'month':
      return state.status === 'ready'
        ? {
            ...state,
            month: action.month,
            games: { kind: 'loading' },
            selected: null,
          }
        : state;
    case 'games':
      return state.status === 'ready'
        ? { ...state, games: action.games }
        : state;
    case 'select':
      return state.status === 'ready'
        ? { ...state, selected: action.game }
        : state;
  }
}

function asChessComError(e: unknown): ChessComError {
  return e instanceof ChessComError ? e : new ChessComError('network');
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export function useGamePicker() {
  const [state, dispatch] = useReducer(pickerReducer, { status: 'idle' });
  const ctl = useRef<AbortController | null>(null);
  const username = useRef('');

  useEffect(() => () => ctl.current?.abort(), []);

  const begin = useCallback(() => {
    ctl.current?.abort();
    ctl.current = new AbortController();
    return ctl.current.signal;
  }, []);

  const loadGames = useCallback(
    async (month: MonthKey, signal: AbortSignal) => {
      try {
        const games = await fetchMonth(
          toUsername(username.current),
          month,
          signal,
        );
        dispatch({ type: 'games', games: { kind: 'loaded', games } });
      } catch (e) {
        if (isAbort(e)) return;
        dispatch({
          type: 'games',
          games: { kind: 'error', error: asChessComError(e) },
        });
      }
    },
    [],
  );

  const search = useCallback(
    async (raw: string) => {
      const user = toUsername(raw);
      if (!user) return;
      username.current = user;
      const signal = begin();
      dispatch({ type: 'search', username: user });
      try {
        const profile = await fetchProfile(user, signal);
        const months = await fetchArchives(user, signal);
        const month = months[0];
        if (!month) throw new ChessComError('no-games');
        dispatch({ type: 'ready', profile, months, month });
        await loadGames(month, signal);
      } catch (e) {
        if (isAbort(e)) return;
        dispatch({ type: 'failed', error: asChessComError(e) });
      }
    },
    [begin, loadGames],
  );

  const selectMonth = useCallback(
    (month: MonthKey) => {
      const signal = begin();
      dispatch({ type: 'month', month });
      void loadGames(month, signal);
    },
    [begin, loadGames],
  );

  const selectGame = useCallback(
    (game: Game | null) => dispatch({ type: 'select', game }),
    [],
  );

  return { state, search, selectMonth, selectGame };
}
