import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';

import { useStore } from '@/app/store';
import { BatchPanel } from '@/components/game-picker/batch-panel';
import { GamePicker } from '@/components/game-picker/game-picker';
import { PgnImport } from '@/components/game-picker/pgn-import';
import { ReviewSetup } from '@/components/game-picker/review-setup';
import { PageHeader } from '@/components/layout/page-header';
import { CoachBubble } from '@/components/review/coach-bubble';
import { Button } from '@/components/ui/button';
import { useBatch } from '@/hooks/use-game-analysis';
import { useReviewedGames } from '@/hooks/use-reviewed-games';
import { isActive } from '@/lib/analysis/batch';
import {
  filterListed,
  isFiltering,
  NO_LIST_FILTER,
  type ListFilter,
} from '@/lib/chesscom/list-filter';
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
  const store = useStore();
  const { staged } = store;
  const reviewed = useReviewedGames();
  const batchRunning = isActive(useBatch().snapshot);
  const shown = shownGames(store);
  // Both the list and the batch read it, so the batch takes what the list shows.
  const [filter, setFilter] = useState<ListFilter>(NO_LIST_FILTER);
  const passing = shown && filterListed(shown[0], filter, shown[1]);
  // A sticky element only moves inside its parent. Small screens stack the
  // cards in this flex column, so the setup card can follow the game list. At
  // lg the second column stretches to the list's height for the same reason.
  return (
    <>
      <PageHeader>Pick a game to roast</PageHeader>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <GamePicker reviewed={reviewed} filter={filter} onFilter={setFilter} />
        <div className="contents lg:flex lg:flex-col lg:gap-8 lg:self-stretch">
          {staged && <ReviewSetup staged={staged} reviewed={reviewed} />}
          <StreakCoach />
          <details open={batchRunning || undefined} className="group">
            <summary className="flex cursor-pointer items-center gap-2 rounded-sm font-bold [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon
                aria-hidden
                className="size-4 transition-transform group-open:rotate-90"
              />
              More ways to add or review games
            </summary>
            <div className="mt-4 flex flex-col gap-8">
              {shown && passing && shown[0].length > 0 && (
                <BatchPanel
                  games={passing}
                  filtered={isFiltering(filter)}
                  reviewed={reviewed}
                />
              )}
              <PgnImport />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
