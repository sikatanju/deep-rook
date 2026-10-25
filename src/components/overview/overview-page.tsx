import { useMemo } from 'react';

import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { readSavedUsernames } from '@/components/game-picker/username-form';
import { ResultStamp } from '@/components/game-picker/result-stamp';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { Panel } from '@/components/panel';
import { CoachBubble } from '@/components/review/coach-bubble';
import { Button } from '@/components/ui/button';
import { useOpeningBook } from '@/hooks/use-opening-book';
import { useSavedReviews } from '@/hooks/use-saved-reviews';
import type { StoredAnalysis } from '@/lib/analysis/cache';
import { ANALYSIS_LEVELS } from '@/lib/analysis/levels';
import {
  overview,
  summarize,
  type GameSummary,
  type OpeningStat,
} from '@/lib/analysis/overview';

import { AccuracyTrend, GradeMix, StageBars } from './charts';

const date = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

/** Holds a panel's height while the saved reviews are read. */
function Pending() {
  return (
    <p aria-busy className="text-ink-muted grid min-h-40 place-items-center">
      Loading…
    </p>
  );
}

function OpeningsTable({ openings }: { openings: OpeningStat[] }) {
  if (openings.length === 0)
    return <p className="text-ink-muted">No openings named yet.</p>;
  const head = 'px-2 py-1.5 text-xs font-extrabold tracking-[0.08em] uppercase';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-line border-b-3">
            <th scope="col" className={head}>
              Opening
            </th>
            <th scope="col" className={`${head} text-right`}>
              Games
            </th>
            <th scope="col" className={`${head} text-right`}>
              W-D-L
            </th>
            <th scope="col" className={`${head} text-right`}>
              Accuracy
            </th>
          </tr>
        </thead>
        <tbody>
          {openings.map((o) => (
            <tr key={o.name} className="border-line border-b-2 last:border-b-0">
              <th scope="row" className="px-2 py-2 font-bold">
                {o.name}
              </th>
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {o.games}
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {o.wins}-{o.draws}-{o.losses}
              </td>
              <td className="px-2 py-2 text-right font-mono font-bold tabular-nums">
                {o.accuracy?.toFixed(1) ?? '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Who({ player }: { player: GameSummary['white'] }) {
  return (
    <>
      {player.name}
      {player.rating && (
        <small className="font-mono text-xs opacity-80">
          {` (${player.rating})`}
        </small>
      )}
    </>
  );
}

function RecentGames({
  games,
  onReview,
}: {
  games: GameSummary[];
  onReview: (game: GameSummary) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {games.map((g) => (
        <li
          key={g.key}
          className="border-line bg-surface grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-sm border-3 px-3 py-2.5 sm:grid-cols-[72px_minmax(0,1fr)_auto_auto_auto_auto]"
        >
          <span>{g.result && <ResultStamp result={g.result} />}</span>
          <span className="truncate font-bold">
            <Who player={g.white} /> vs <Who player={g.black} />
          </span>
          <span className="font-mono text-sm font-bold tabular-nums">
            <span className="sr-only">Accuracy </span>
            {g.accuracy?.toFixed(1) ?? '–'}
          </span>
          <span className="border-line bg-surface-alt rounded-sm border-2 px-1.5 text-xs font-bold">
            {ANALYSIS_LEVELS[g.level].label}
          </span>
          <time
            dateTime={new Date(g.analyzedAt).toISOString()}
            className="text-ink-muted col-span-2 text-xs whitespace-nowrap sm:col-span-1"
          >
            {date.format(g.analyzedAt)}
          </time>
          <Button size="sm" onClick={() => onReview(g)}>
            Review again
            <span className="sr-only">
              : {g.white.name} vs {g.black.name}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function OverviewPage() {
  const { reviewReplay } = useStore();
  const { records } = useSavedReviews();
  const usernames = useMemo(() => readSavedUsernames(), []);
  const book = useOpeningBook();
  // Waits for the opening table, so the openings never regroup under the reader.
  const summaries = useMemo(
    () =>
      records &&
      book !== undefined &&
      records.map((r) => summarize(r, usernames, book)),
    [records, usernames, book],
  );
  const data = useMemo(() => summaries && overview(summaries), [summaries]);

  function reviewAgain(game: GameSummary) {
    const record = records?.find((r: StoredAnalysis) => r.key === game.key);
    if (!record) return;
    reviewReplay(
      record.replay,
      `${game.white.name} vs ${game.black.name}`,
      game.me ?? 'w',
      record.level,
    );
  }

  const header = (
    <PageHeader eyebrow="Across your reviewed games">
      Your <Highlight>progress</Highlight>
    </PageHeader>
  );

  if (data && records?.length === 0)
    return (
      <>
        {header}
        <CoachBubble
          title="Nothing reviewed yet."
          actions={
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate('games')}
            >
              Pick a game
            </Button>
          }
        >
          Review a game and it is saved in this browser. Your progress builds up
          here.
        </CoachBubble>
      </>
    );

  return (
    <>
      {header}
      {data && data.games === 0 && (
        <CoachBubble
          title="None of these games are yours."
          actions={
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate('games')}
            >
              Go to Games
            </Button>
          }
        >
          I match games to you by your Chess.com or Lichess username. Load yours
          on the Games page and review a game of yours to see your progress.
        </CoachBubble>
      )}
      {(!data || data.games > 0) && (
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <Panel
            tag="Trend"
            title="Accuracy"
            subtitle="Your latest games, oldest to newest."
          >
            {data ? <AccuracyTrend games={data.trend} /> : <Pending />}
          </Panel>
          <Panel
            tag="Moves"
            title="Grade mix"
            subtitle="Every move you played in the games above."
          >
            {data ? <GradeMix totals={data.gradeTotals} /> : <Pending />}
          </Panel>
          <Panel
            tag="Stages"
            title="Where mistakes happen"
            subtitle="Mistakes, misses and blunders per 100 of your moves."
          >
            {data ? <StageBars stages={data.stages} /> : <Pending />}
          </Panel>
          <Panel
            tag="Openings"
            title="Openings that cost you"
            subtitle="Lowest average accuracy first."
          >
            {data ? <OpeningsTable openings={data.openings} /> : <Pending />}
          </Panel>
        </div>
      )}
      <Panel tag="Saved" title="Recent games">
        {data ? (
          <RecentGames games={data.recent} onReview={reviewAgain} />
        ) : (
          <Pending />
        )}
      </Panel>
    </>
  );
}
