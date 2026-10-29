import { GameRow, type RowMark } from '@/components/game-picker/game-row';
import {
  SessionStrip,
  type SessionResult,
} from '@/components/game-picker/session-strip';
import { Button } from '@/components/ui/button';
import { cap, FilterChips } from '@/components/ui/filter-chips';
import {
  filterListed,
  isFiltering,
  NO_LIST_FILTER,
  SPEEDS,
  type ListFilter,
} from '@/lib/chesscom/list-filter';
import { groupByDay, outcomeFor, type Outcome } from '@/lib/chesscom/session';
import type { Game } from '@/lib/chesscom/types';

const RESULT: Record<Outcome, SessionResult> = {
  win: 'W',
  loss: 'L',
  draw: 'D',
};

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const RESULTS = [
  { id: 'win', name: 'Win' },
  { id: 'loss', name: 'Loss' },
  { id: 'draw', name: 'Draw' },
] as const;

/** Time-control and result chips; only the time controls in `games` are offered. */
function ListFilters({
  games,
  filter,
  onChange,
}: {
  games: readonly Game[];
  filter: ListFilter;
  onChange: (filter: ListFilter) => void;
}) {
  // The chosen speed stays, so a games list without it can still be undone.
  const speeds = SPEEDS.filter(
    (s) => s === filter.speed || games.some((g) => g.timeClass === s),
  );
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      <FilterChips
        label="Time control"
        any={{ id: 'all', name: 'Any speed' }}
        options={speeds.map((s) => ({ id: s, name: cap(s) }))}
        value={filter.speed}
        onChange={(speed) => onChange({ ...filter, speed })}
      />
      <FilterChips
        label="Result"
        any={{ id: 'all', name: 'Any result' }}
        options={RESULTS}
        value={filter.result}
        onChange={(result) => onChange({ ...filter, result })}
      />
    </div>
  );
}

/**
 * Games newest first, one section per calendar day with its session strip,
 * under the filter chips. Only the games that pass `filter` are listed.
 */
export function GameList({
  games: all,
  username,
  filter = NO_LIST_FILTER,
  onFilter,
  selectedId,
  markOf,
  onSelect,
  empty,
}: {
  games: Game[];
  username: string;
  filter?: ListFilter;
  onFilter: (filter: ListFilter) => void;
  selectedId: string | undefined;
  markOf?: (game: Game) => RowMark | undefined;
  onSelect: (game: Game) => void;
  /** What to say when `games` is empty. */
  empty: string;
}) {
  if (all.length === 0) return <p className="text-ink-muted">{empty}</p>;
  const games = filterListed(all, filter, username);
  return (
    <div className="flex flex-col gap-8">
      <ListFilters games={all} filter={filter} onChange={onFilter} />
      {games.length === 0 && isFiltering(filter) && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-ink-muted">No games match these filters.</p>
          <Button size="sm" onClick={() => onFilter(NO_LIST_FILTER)}>
            Clear filters
          </Button>
        </div>
      )}
      {groupByDay(games).map((day) => {
        // The strip reads oldest to newest, the list newest to oldest.
        const played = day.games
          .map((game) => outcomeFor(game, username))
          .reverse();
        return (
          <section key={day.key}>
            <h3 className="text-ink-muted text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
              {dayFormat.format(day.date)} · {day.games.length}{' '}
              {day.games.length === 1 ? 'game' : 'games'}
            </h3>
            <SessionStrip
              results={played.map((g) => RESULT[g.outcome])}
              ratings={played.map((g) => g.me.rating)}
            />
            <ul className="mt-6 flex flex-col gap-2">
              {day.games.map((game) => {
                const { white, me, opponent, outcome } = outcomeFor(
                  game,
                  username,
                );
                return (
                  <li key={game.id}>
                    <GameRow
                      result={outcome}
                      opponent={opponent.username}
                      opponentRating={opponent.rating}
                      playedWhite={white}
                      timeControl={`${game.timeClass} ${game.timeControl}`}
                      myRating={me.rating}
                      when={dateFormat.format(game.endedAt)}
                      dateTime={game.endedAt.toISOString()}
                      selected={game.id === selectedId}
                      mark={markOf?.(game)}
                      onSelect={() => onSelect(game)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
