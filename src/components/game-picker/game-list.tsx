import { GameRow, type RowMark } from '@/components/game-picker/game-row';
import {
  SessionStrip,
  type SessionResult,
} from '@/components/game-picker/session-strip';
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

/** Games newest first, one section per calendar day with its session strip. */
export function GameList({
  games,
  username,
  selectedId,
  markOf,
  onSelect,
  empty,
}: {
  games: Game[];
  username: string;
  selectedId: string | undefined;
  markOf?: (game: Game) => RowMark | undefined;
  onSelect: (game: Game) => void;
  /** What to say when `games` is empty. */
  empty: string;
}) {
  if (games.length === 0) return <p className="text-ink-muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-8">
      {groupByDay(games).map((day) => {
        // The strip reads oldest to newest, the list newest to oldest.
        const played = day.games
          .map((game) => outcomeFor(game, username))
          .reverse();
        return (
          <section key={day.key}>
            <h3 className="text-ink-muted text-xs leading-4 font-bold">
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
