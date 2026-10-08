import { Badge } from '@/components/ui/badge';
import type { Game } from '@/lib/chesscom/types';
import { cn } from '@/lib/utils';

type Outcome = 'win' | 'loss' | 'draw';

function outcomeFor(game: Game, username: string) {
  const white = game.white.username.toLowerCase() === username.toLowerCase();
  const me = white ? game.white : game.black;
  const opponent = white ? game.black : game.white;
  const outcome: Outcome =
    me.result === 'win' ? 'win' : opponent.result === 'win' ? 'loss' : 'draw';
  return { white, me, opponent, outcome };
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  win: 'Won',
  loss: 'Lost',
  draw: 'Draw',
};

const OUTCOME_VARIANT = {
  win: 'default',
  loss: 'destructive',
  draw: 'secondary',
} as const;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function GameList({
  games,
  username,
  selectedId,
  onSelect,
}: {
  games: Game[];
  username: string;
  selectedId: string | undefined;
  onSelect: (game: Game) => void;
}) {
  if (games.length === 0) {
    return (
      <p className="text-sm opacity-70">No standard chess games this month.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {games.map((game) => {
        const { white, me, opponent, outcome } = outcomeFor(game, username);
        const selected = game.id === selectedId;
        return (
          <li key={game.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(game)}
              className={cn(
                'focus-visible:ring-ring flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm outline-none focus-visible:ring-2',
                selected ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              <Badge variant={OUTCOME_VARIANT[outcome]}>
                {OUTCOME_LABEL[outcome]}
              </Badge>
              <span className="flex-1 truncate">
                <span className="sr-only">
                  {white ? 'White' : 'Black'} against{' '}
                </span>
                {opponent.username} ({opponent.rating})
              </span>
              <span className="opacity-70">
                {game.timeClass} {game.timeControl}
              </span>
              <span className="hidden opacity-70 sm:inline">
                me {me.rating}
              </span>
              <time
                className="opacity-70"
                dateTime={game.endedAt.toISOString()}
              >
                {dateFormat.format(game.endedAt)}
              </time>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
