import type { ReactNode } from 'react';

import { GradeSticker } from '@/components/review/grade-sticker';
import { CLASSIFICATIONS, SCORED_GRADES } from '@/lib/analysis/classify';
import type { Overview, Pressure, Rate } from '@/lib/analysis/overview';
import { STAGES, type Stage } from '@/lib/chess/stage';

const STAGE_IDS = Object.keys(STAGES) as Stage[];

const WIDTH = 1000;
const HEIGHT = 100;
/** Fewer games than this leave empty room on the right instead of stretching bars. */
const MIN_SLOTS = 10;
const BAR_SHARE = 0.7;

const date = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const stat = 'font-mono text-sm font-bold tabular-nums';

/** Rating points keep this far from the top and bottom of the chart. */
const RATING_MARGIN = 14;

type Trend = Overview['trend'][number];

/** One game's tooltip: both figures, so the bar and its rating dot read the same. */
const tip = (g: Trend) =>
  `${date.format(g.analyzedAt)}: accuracy ${g.accuracy.toFixed(1)}${g.rating === null ? '' : `, rating ${g.rating}`}`;

/**
 * One bar per game, oldest left, height = accuracy, with the player's rating
 * as a line over the bars on a scale of its own. A game with no rating leaves
 * a gap in the line. The name and the caption say the same thing the chart
 * shows, and each bar's title gives its figures.
 */
export function AccuracyTrend({ games }: { games: Overview['trend'] }) {
  if (games.length === 0)
    return <p className="text-ink-muted">No accuracy figures yet.</p>;
  const slot = WIDTH / Math.max(games.length, MIN_SLOTS);
  const bar = slot * BAR_SHARE;
  const latest = games.at(-1)!.accuracy;
  const average = games.reduce((n, g) => n + g.accuracy, 0) / games.length;

  const ratings = games.flatMap((g) => (g.rating === null ? [] : [g.rating]));
  const low = Math.min(...ratings);
  const high = Math.max(...ratings);
  const yOf = (rating: number) =>
    high === low
      ? HEIGHT / 2
      : HEIGHT -
        RATING_MARGIN -
        ((rating - low) / (high - low)) * (HEIGHT - 2 * RATING_MARGIN);
  const points = games.map((g, i) => ({
    game: g,
    x: i * slot + slot / 2,
    y: g.rating === null ? null : yOf(g.rating),
  }));
  // Runs of rated games; an unrated one ends the run, so the line has a gap.
  const runs: string[][] = [[]];
  for (const { x, y } of points) {
    if (y === null) runs.push([]);
    else runs.at(-1)!.push(`${x} ${y}`);
  }
  const lines = runs
    .filter((run) => run.length > 1)
    .map((run) => 'M' + run.join('L'));
  const latestRating = ratings.length ? ratings.at(-1)! : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="border-line bg-surface-alt border-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Accuracy over your last ${games.length} ${games.length === 1 ? 'game' : 'games'}, oldest to newest, latest ${latest.toFixed(1)}${latestRating === null ? '' : `, with your rating, latest ${latestRating}`}`}
          className="block h-40 w-full"
        >
          <line
            x1={0}
            x2={WIDTH}
            y1={HEIGHT / 2}
            y2={HEIGHT / 2}
            stroke="var(--draw)"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          {games.map((g, i) => (
            <rect
              key={g.key}
              x={i * slot + (slot - bar) / 2}
              y={HEIGHT - g.accuracy}
              width={bar}
              height={g.accuracy}
              fill="var(--primary)"
              stroke="var(--line)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            >
              <title>{tip(g)}</title>
            </rect>
          ))}
          {/* An ink path under an accent one keeps the line readable over the bars. */}
          {[
            { stroke: 'var(--line)', width: 7, top: false },
            { stroke: 'var(--accent)', width: 3, top: true },
          ].map(({ stroke, width, top }) => (
            <g
              key={stroke}
              fill="none"
              stroke={stroke}
              strokeWidth={width}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {lines.map((d) => (
                <path key={d} d={d} vectorEffect="non-scaling-stroke" />
              ))}
              {/* A zero-length round-capped path is a dot that stays round under the stretched viewBox. */}
              {points.map(
                ({ game, x, y }) =>
                  y !== null && (
                    <path
                      key={game.key}
                      data-rating={top ? game.rating : undefined}
                      d={`M${x} ${y}h0`}
                      strokeWidth={width + 6}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{tip(game)}</title>
                    </path>
                  ),
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="text-ink-muted">
        Latest <span className={stat}>{latest.toFixed(1)}</span>, average{' '}
        <span className={stat}>{average.toFixed(1)}</span> over{' '}
        <span className={stat}>{games.length}</span>{' '}
        {games.length === 1 ? 'game' : 'games'}.
        {latestRating !== null && (
          <>
            {' '}
            The line is your rating, latest{' '}
            <span className={stat}>{latestRating}</span>, from{' '}
            <span className={stat}>{low}</span> to{' '}
            <span className={stat}>{high}</span>.
          </>
        )}
      </p>
    </div>
  );
}

/** Every grade as a share of all your moves, in the grades' own colors. */
export function GradeMix({ totals }: { totals: Overview['gradeTotals'] }) {
  const all = SCORED_GRADES.reduce((n, g) => n + totals[g], 0);
  return (
    <ul className="flex flex-col gap-1.5">
      {SCORED_GRADES.map((grade) => {
        const share = all ? (totals[grade] / all) * 100 : 0;
        return (
          <li
            key={grade}
            data-grade={grade}
            data-count={totals[grade]}
            className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem] items-center gap-3"
          >
            <GradeSticker grade={grade} className="justify-self-start" />
            <div className="bg-surface-alt h-4 rounded-sm">
              {share > 0 && (
                <div
                  className="border-line h-full rounded-sm border-2"
                  style={{
                    width: `${share}%`,
                    background: CLASSIFICATIONS[grade].color,
                  }}
                />
              )}
            </div>
            <span
              className={`${stat} text-right ${totals[grade] === 0 ? 'text-ink-muted' : ''}`}
            >
              {totals[grade]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Mistakes per 100 of your moves in each row, scaled to the worst one. */
export function RateBars({
  rows,
}: {
  rows: readonly {
    id: string;
    label: string;
    rate: Rate;
    /** Shown beside the figure, such as a link to what the row counts. */
    action?: ReactNode;
  }[];
}) {
  const worst = Math.max(1, ...rows.map((r) => r.rate.per100 ?? 0));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ id, label, rate: { per100, mistakes, plies }, action }) => (
        <li key={id} data-row={id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-extrabold">{label}</span>
            <span className="text-ink-muted text-sm">
              {per100 === null ? (
                'No moves yet'
              ) : (
                <>
                  <span className={`${stat} text-ink`}>
                    {per100.toFixed(1)}
                  </span>{' '}
                  per 100 moves, {mistakes} of {plies}
                </>
              )}
            </span>
          </div>
          {action}
          <div className="bg-surface-alt h-5 rounded-sm">
            {per100 !== null && per100 > 0 && (
              <div
                className="border-line bg-grade-mistake h-full rounded-sm border-2"
                style={{ width: `${(per100 / worst) * 100}%` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StageBars({
  stages,
  action,
}: {
  stages: Overview['stages'];
  /** What to show under each stage's figure. */
  action?: (stage: Stage) => ReactNode;
}) {
  return (
    <RateBars
      rows={STAGE_IDS.map((id) => ({
        id,
        label: STAGES[id].label,
        rate: stages[id],
        action: action?.(id),
      }))}
    />
  );
}

const PRESSURE_LABELS: Record<Pressure, string> = {
  calm: 'With time on the clock',
  trouble: 'In time trouble',
};

/** The same rate with time to think and without, and what share of the mistakes came short of time. */
export function TimeTrouble({ clock }: { clock: Overview['clock'] }) {
  if (clock.games === 0)
    return (
      <p className="text-ink-muted">
        No clock readings yet. Chess.com and Lichess games carry them.
      </p>
    );
  const { calm, trouble } = clock;
  const all = calm.mistakes + trouble.mistakes;
  return (
    <div className="flex flex-col gap-4">
      <RateBars
        rows={(['calm', 'trouble'] as const).map((id) => ({
          id,
          label: PRESSURE_LABELS[id],
          rate: clock[id],
        }))}
      />
      <p className="text-ink-muted">
        {all === 0 ? (
          'No mistakes yet'
        ) : (
          <>
            <span className={`${stat} text-ink`}>{trouble.mistakes}</span> of
            your <span className={`${stat} text-ink`}>{all}</span>{' '}
            {all === 1 ? 'mistake' : 'mistakes'} came in time trouble
          </>
        )}
        , over <span className={stat}>{clock.games}</span>{' '}
        {clock.games === 1 ? 'game' : 'games'} with clocks.
      </p>
    </div>
  );
}
