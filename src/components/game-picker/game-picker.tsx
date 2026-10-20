import { useState } from 'react';

import { useStore } from '@/app/store';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorMessages } from '@/lib/chesscom/errors';
import type { Game, MonthKey } from '@/lib/chesscom/types';

import { GameList } from './game-list';
import { UsernameForm } from './username-form';

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function monthLabel(key: MonthKey): string {
  const [year, month] = key.split('-').map(Number);
  return monthFormat.format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1)));
}

export function GamePicker() {
  const { state, search, selectMonth, stageGame } = useStore();
  const [openError, setOpenError] = useState<string | null>(null);

  function stage(game: Game) {
    try {
      stageGame(game);
      setOpenError(null);
    } catch {
      setOpenError('That game could not be read.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find a game</CardTitle>
        <CardDescription>
          Enter a Chess.com username to list their recent games.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <UsernameForm busy={state.status === 'loading'} onSearch={search} />
        <div aria-live="polite" className="flex flex-col gap-4">
          {state.status === 'loading' && (
            <p className="text-sm opacity-70">Loading {state.username}…</p>
          )}
          {state.status === 'error' && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessages[state.error.kind]}
            </p>
          )}
          {state.status === 'ready' && (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {state.profile.title ? `${state.profile.title} ` : ''}
                  {state.profile.username}
                </p>
                <Select
                  value={state.month}
                  onValueChange={(m) => selectMonth(m as MonthKey)}
                >
                  <SelectTrigger aria-label="Month" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {state.months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {monthLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {state.games.kind === 'loading' && (
                <p className="text-sm opacity-70">Loading games…</p>
              )}
              {state.games.kind === 'error' && (
                <p role="alert" className="text-destructive text-sm">
                  {errorMessages[state.games.error.kind]}
                </p>
              )}
              {state.games.kind === 'loaded' && (
                <GameList
                  games={state.games.games}
                  username={state.profile.username}
                  selectedId={state.selected?.id}
                  onSelect={stage}
                />
              )}
              {openError && (
                <p role="alert" className="text-destructive text-sm">
                  {openError}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
