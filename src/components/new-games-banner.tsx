import { XIcon } from 'lucide-react';
import { useState } from 'react';

import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { useBatch } from '@/hooks/use-game-analysis';
import { useNewGames } from '@/hooks/use-new-games';
import { useReviewedGames } from '@/hooks/use-reviewed-games';
import { isActive } from '@/lib/analysis/batch';
import { satisfies } from '@/lib/analysis/levels';
import { sinceText } from '@/lib/new-games';

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Says when the player's saved usernames have games they have not seen, and
 * offers to review exactly those, skipping any already saved at the chosen
 * mode. Dismissing marks them seen. Once the review starts it follows the
 * batch here, since the batch itself only shows on the Games page. `hidden`
 * keeps it off the review board without losing what it found.
 */
export function NewGamesBanner({ hidden }: { hidden?: boolean }) {
  const { found, seen, dismiss } = useNewGames();
  const { settings } = useStore();
  const reviewed = useReviewedGames();
  const { snapshot, start } = useBatch();
  const [started, setStarted] = useState(false);
  // Hidden, not unmounted: the check runs once per open and must outlive a page.
  if (!found || hidden) return null;

  const level = settings.analysisLevel;
  const todo = found.games.filter(
    (g) => !satisfies(reviewed?.byLink.get(g.url) ?? null, level),
  );

  const close = (
    <Button size="sm" variant="ghost" onClick={dismiss}>
      <XIcon aria-hidden />
      <span className="sr-only">Dismiss</span>
    </Button>
  );

  if (started) {
    return (
      <div
        role="status"
        className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-md border-3 p-4 shadow-md"
      >
        <p className="min-w-0 flex-1 font-bold">
          {isActive(snapshot)
            ? `Reviewing game ${snapshot.finished + 1} of ${snapshot.total}…`
            : snapshot.phase === 'idle'
              ? ''
              : snapshot.phase === 'unavailable'
                ? 'The engine cannot run in this browser.'
                : `Reviewed ${snapshot.finished - snapshot.failed} of ${snapshot.total} new games.`}
        </p>
        {!isActive(snapshot) && snapshot.phase !== 'idle' && (
          <Button size="sm" onClick={() => navigate('overview')}>
            See your progress
          </Button>
        )}
        {close}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="New games"
      className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-md border-3 p-4 shadow-md"
    >
      <p className="min-w-0 flex-1 font-bold">
        {plural(found.count, 'new game', 'new games')} since{' '}
        {sinceText(found.since, found.checkedAt)},{' '}
        {found.losses === 0
          ? 'no losses'
          : plural(found.losses, 'loss', 'losses')}
        . {todo.length === 0 ? 'All are reviewed already.' : 'Review them?'}
      </p>
      {todo.length > 0 && (
        <Button
          size="sm"
          variant="primary"
          disabled={reviewed === null}
          onClick={() => {
            start(
              todo.map((g) => ({
                id: g.id,
                label: `${g.white.username} vs ${g.black.username}`,
                pgn: g.pgn,
              })),
              level,
            );
            seen();
            setStarted(true);
          }}
        >
          Review them
        </Button>
      )}
      {close}
    </div>
  );
}
