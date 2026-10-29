import { useState } from 'react';

import { useStore } from '@/app/store';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBatchGame } from '@/hooks/use-game-analysis';
import type { ReviewedGames } from '@/hooks/use-reviewed-games';
import { errorMessages } from '@/lib/chesscom/errors';
import { outcomeFor } from '@/lib/chesscom/session';
import type { Game, MonthKey, Site } from '@/lib/chesscom/types';
import { lichessErrorMessages } from '@/lib/lichess/errors';
import { cn } from '@/lib/utils';

import { GameList } from './game-list';
import type { RowMark } from './game-row';
import { SITE_NAMES, UsernameForm } from './username-form';

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function monthLabel(key: MonthKey): string {
  const [year, month] = key.split('-').map(Number);
  return monthFormat.format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1)));
}

const SITES = Object.keys(SITE_NAMES) as Site[];

/** Two chips over real radios, so the arrow keys are the browser's. */
function SiteSwitch({
  value,
  onChange,
}: {
  value: Site;
  onChange: (site: Site) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-3 border-0 p-0">
      <legend className="sr-only">Game source</legend>
      {SITES.map((site) => (
        <label
          key={site}
          className={cn(
            'border-line bg-surface text-ink has-[:focus-visible]:outline-focus cursor-pointer rounded-sm border-2 px-3 py-1.5 font-bold has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2',
            value === site && 'bg-primary text-sticker-ink',
          )}
        >
          <input
            type="radio"
            name="game-source"
            className="sr-only"
            checked={value === site}
            onChange={() => onChange(site)}
          />
          {SITE_NAMES[site]}
        </label>
      ))}
    </fieldset>
  );
}

function Alert({ children }: { children: string }) {
  return (
    <p role="alert" className="text-ink font-bold">
      {children}
    </p>
  );
}

type ListProps = {
  onStage: (game: Game) => void;
  markOf: (game: Game) => RowMark | undefined;
};

function ChessComGames({ onStage, markOf }: ListProps) {
  const { state, search, selectMonth } = useStore();
  return (
    <>
      <UsernameForm
        site="chesscom"
        busy={state.status === 'loading'}
        onSearch={search}
      />
      <div aria-live="polite" className="flex flex-col gap-4">
        {state.status === 'loading' && (
          <p className="text-ink-muted">Loading {state.username}…</p>
        )}
        {state.status === 'error' && (
          <Alert>{errorMessages[state.error.kind]}</Alert>
        )}
        {state.status === 'ready' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-lg font-extrabold">
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
              <p className="text-ink-muted">Loading games…</p>
            )}
            {state.games.kind === 'error' && (
              <Alert>{errorMessages[state.games.error.kind]}</Alert>
            )}
            {state.games.kind === 'loaded' && (
              <GameList
                games={state.games.games}
                username={state.profile.username}
                selectedId={state.selected?.id}
                markOf={markOf}
                onSelect={onStage}
                empty="No standard chess games this month."
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

function LichessGames({ onStage, markOf }: ListProps) {
  const {
    lichess: { state, search, loadOlder },
  } = useStore();
  return (
    <>
      <UsernameForm
        site="lichess"
        busy={state.status === 'loading'}
        onSearch={search}
      />
      <div aria-live="polite" className="flex flex-col gap-4">
        {state.status === 'loading' && (
          <p className="text-ink-muted">Loading {state.username}…</p>
        )}
        {state.status === 'error' && (
          <Alert>{lichessErrorMessages[state.error.kind]}</Alert>
        )}
        {state.status === 'ready' && (
          <>
            <p className="text-lg font-extrabold">
              {state.games[0]
                ? outcomeFor(state.games[0], state.username).me.username
                : state.username}
            </p>
            <GameList
              games={state.games}
              username={state.username}
              selectedId={state.selected?.id}
              markOf={markOf}
              onSelect={onStage}
              empty="No standard chess games to show."
            />
            {state.older.kind === 'error' && (
              <Alert>{lichessErrorMessages[state.older.error.kind]}</Alert>
            )}
            {state.next !== null && (
              <Button
                className="self-start"
                disabled={state.older.kind === 'loading'}
                onClick={() => void loadOlder()}
              >
                {state.older.kind === 'loading'
                  ? 'Loading…'
                  : 'Load older games'}
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function GamePicker({ reviewed }: { reviewed: ReviewedGames | null }) {
  const { site, setSite, stageGame } = useStore();
  const [openError, setOpenError] = useState<string | null>(null);
  const analyzing = useBatchGame();
  const markOf = (game: Game): RowMark | undefined =>
    game.id === analyzing
      ? 'analyzing'
      : reviewed?.byLink.has(game.url)
        ? 'reviewed'
        : undefined;

  function stage(game: Game) {
    try {
      stageGame(game);
      setOpenError(null);
    } catch {
      setOpenError('That game could not be read.');
    }
  }

  return (
    <Panel
      title="Find a game"
      subtitle={`Enter a ${SITE_NAMES[site]} username to list their recent games.`}
    >
      <SiteSwitch
        value={site}
        onChange={(next) => {
          setSite(next);
          setOpenError(null);
        }}
      />
      {site === 'chesscom' ? (
        <ChessComGames onStage={stage} markOf={markOf} />
      ) : (
        <LichessGames onStage={stage} markOf={markOf} />
      )}
      {openError && <Alert>{openError}</Alert>}
    </Panel>
  );
}
