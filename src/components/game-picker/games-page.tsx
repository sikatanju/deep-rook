import { useStore } from '@/app/store';
import { GamePicker } from '@/components/game-picker/game-picker';
import { PgnImport } from '@/components/game-picker/pgn-import';
import { ReviewSetup } from '@/components/game-picker/review-setup';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { CoachBubble } from '@/components/review/coach-bubble';
import { Button } from '@/components/ui/button';
import { losingStreak } from '@/lib/chesscom/session';
import type { Game } from '@/lib/chesscom/types';

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

/** The games listed for the site on show, and whose side to read them from. */
function shownGames({
  site,
  state,
  lichess,
}: ReturnType<typeof useStore>): [Game[], string] | null {
  if (site === 'lichess')
    return lichess.state.status === 'ready'
      ? [lichess.state.games, lichess.state.username]
      : null;
  return state.status === 'ready' && state.games.kind === 'loaded'
    ? [state.games.games, state.profile.username]
    : null;
}

/** Only when the latest day really is going badly. */
function StreakCoach() {
  const store = useStore();
  const { stageGame } = store;
  const shown = shownGames(store);
  if (!shown) return null;
  const streak = losingStreak(...shown);
  if (!streak) return null;
  return (
    <CoachBubble
      grade="blunder"
      title="Rough session, huh?"
      actions={
        <Button
          size="sm"
          variant="primary"
          onClick={() => stageGame(streak.last)}
        >
          Review last loss
        </Button>
      }
    >
      {streak.count} losses in a row, the latest at{' '}
      {timeFormat.format(streak.last.endedAt)}. Want to see where it slipped?
    </CoachBubble>
  );
}

export function GamesPage() {
  const { staged } = useStore();
  // A sticky element only moves inside its parent. Small screens stack the
  // cards in this flex column, so the setup card can follow the game list. At
  // lg the second column stretches to the list's height for the same reason.
  return (
    <>
      <PageHeader eyebrow={`Step ${staged ? 2 : 1} of 2`}>
        Pick a game to <Highlight>roast</Highlight>
      </PageHeader>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <GamePicker />
        <div className="contents lg:flex lg:flex-col lg:gap-8 lg:self-stretch">
          {staged && <ReviewSetup staged={staged} />}
          <PgnImport />
          <StreakCoach />
        </div>
      </div>
    </>
  );
}
