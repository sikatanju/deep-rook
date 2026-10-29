import { useState } from 'react';

import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { LevelPicker } from '@/components/level-picker';
import { PauseNote } from '@/components/review/pause-note';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useBatch } from '@/hooks/use-game-analysis';
import type { ReviewedGames } from '@/hooks/use-reviewed-games';
import {
  isActive,
  type ActiveBatch,
  type EndedBatch,
} from '@/lib/analysis/batch';
import { ANALYSIS_LEVELS, satisfies } from '@/lib/analysis/levels';
import type { Game } from '@/lib/chesscom/types';
import { askPermission, permission } from '@/lib/notify';
import { cn } from '@/lib/utils';

const COUNTS = [5, 10, 20] as const;

const games = (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`;

/** How many of the latest games to take, as chips over real radios. */
function CountSwitch({
  value,
  onChange,
}: {
  value: number;
  onChange: (count: number) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-3 border-0 p-0">
      <legend className="sr-only">How many of your latest games</legend>
      <span aria-hidden className="font-bold">
        Latest
      </span>
      {COUNTS.map((count) => (
        <label
          key={count}
          className={cn(
            'border-line bg-surface text-ink has-[:focus-visible]:outline-focus cursor-pointer rounded-sm border-2 px-3 py-1 font-mono font-bold has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2',
            value === count &&
              'bg-primary text-sticker-ink -translate-x-0.5 -translate-y-0.5',
          )}
        >
          <input
            type="radio"
            name="batch-count"
            className="sr-only"
            checked={value === count}
            onChange={() => onChange(count)}
          />
          {count}
          <span className="sr-only"> games</span>
        </label>
      ))}
    </fieldset>
  );
}

function Progress({ snapshot }: { snapshot: ActiveBatch }) {
  const { total, finished, current } = snapshot;
  const share = (finished + current.done / current.positions) / total;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-bold">
        Game {finished + 1} of {total}: {current.label}
      </p>
      <div
        role="progressbar"
        aria-label="Batch progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        className="border-line bg-surface-alt h-5 rounded-sm border-2"
      >
        <div
          className="bg-primary h-full"
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <p aria-live="polite" className="text-ink-muted">
        {snapshot.phase === 'yielding'
          ? 'Paused while the engine finishes the review you opened.'
          : `${current.done} of ${current.positions} positions settled, at ${ANALYSIS_LEVELS[snapshot.level].label}.`}
      </p>
      <PauseNote />
    </div>
  );
}

/**
 * The one place the browser is asked to allow notifications: after a batch has
 * started, and only on a click. Nothing shows where they are unsupported or blocked.
 */
function NotifyOptIn() {
  const [allowed, setAllowed] = useState(permission);
  if (allowed === 'unsupported' || allowed === 'denied') return null;
  if (allowed === 'granted')
    return (
      <p className="text-ink-muted">
        You will get a notification when the reviews are ready, if this tab is
        in the background.
      </p>
    );
  return (
    <div>
      <Button size="sm" onClick={() => askPermission().then(setAllowed)}>
        Notify me when it finishes
      </Button>
    </div>
  );
}

/** What the last batch came to, once it is over. */
function Outcome({ snapshot }: { snapshot: EndedBatch }) {
  const { phase, total, finished, failed } = snapshot;
  const saved = finished - failed;
  const text =
    phase === 'unavailable'
      ? 'The engine cannot run in this browser.'
      : phase === 'cancelled'
        ? `Stopped after ${finished} of ${total}. The ones that finished are saved.`
        : `Done. ${games(saved)} reviewed and saved${failed ? `, ${failed} could not be` : ''}.`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className="font-bold">
        {text}
      </p>
      {saved > 0 && (
        <Button size="sm" onClick={() => navigate('overview')}>
          See your progress
        </Button>
      )}
    </div>
  );
}

/**
 * Reviews the latest games on the list in the background, skipping the ones
 * already saved at the chosen mode. The batch outlives this panel: it keeps
 * going on other pages and pauses for any review you open.
 */
export function BatchPanel({
  games: listed,
  reviewed,
}: {
  /** Newest first. */
  games: readonly Game[];
  reviewed: ReviewedGames | null;
}) {
  const { settings, setSettings } = useStore();
  const { snapshot, start, cancel } = useBatch();
  const [count, setCount] = useState<number>(COUNTS[1]);
  const level = settings.analysisLevel;
  const latest = listed.slice(0, count);
  const todo = latest.filter(
    (g) => !satisfies(reviewed?.byLink.get(g.url) ?? null, level),
  );

  return (
    <Panel
      title="Review in bulk"
      subtitle="Analyze your latest games one after another and save each one."
    >
      {isActive(snapshot) ? (
        <>
          <Progress snapshot={snapshot} />
          <NotifyOptIn />
          <div>
            <Button onClick={cancel}>Stop</Button>
          </div>
        </>
      ) : (
        <>
          {snapshot.phase !== 'idle' && <Outcome snapshot={snapshot} />}
          <CountSwitch value={count} onChange={setCount} />
          <LevelPicker
            compact
            name="batch-mode"
            value={level}
            onChange={(analysisLevel) => setSettings({ analysisLevel })}
          />
          <p aria-live="polite" className="text-ink-muted">
            {reviewed === null
              ? 'Checking your saved reviews…'
              : todo.length === 0
                ? `All ${games(latest.length)} are reviewed at ${ANALYSIS_LEVELS[level].label} already.`
                : `${games(todo.length)} to analyze. ${latest.length - todo.length} already reviewed at this mode. ${ANALYSIS_LEVELS[level].blurb}`}
          </p>
          <div>
            <Button
              variant="primary"
              disabled={reviewed === null || todo.length === 0}
              onClick={() =>
                start(
                  todo.map((g) => ({
                    id: g.id,
                    label: `${g.white.username} vs ${g.black.username}`,
                    pgn: g.pgn,
                  })),
                  level,
                )
              }
            >
              Analyze {games(todo.length)}
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
