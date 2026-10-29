import { useEffect, useRef, useState } from 'react';

import type { GameAnalysis } from '@/lib/analysis/game-analysis';
import {
  formatRemaining,
  progressOf,
  remainingMs,
  type AnalysisProgress as Progress,
  type Sample,
} from '@/lib/analysis/progress';

/** The announcement steps this far, so a screen reader hears a few updates, not hundreds. */
const ANNOUNCE_EVERY = 25;

/** How often the time left is worked out again, so the text does not flicker. */
const TICK_MS = 1000;

/**
 * The time left at the rate seen since the job began, worked out once a
 * second, and whether a bar was ever shown.
 */
function useRun(progress: Progress | null) {
  const [left, setLeft] = useState<number | null>(null);
  const [worked, setWorked] = useState(false);
  if (progress && !worked) setWorked(true);

  const latest = useRef(progress);
  useEffect(() => {
    latest.current = progress;
  });
  const active = progress !== null;

  useEffect(() => {
    if (!active) return;
    let start: Sample | null = null;
    const id = setInterval(() => {
      const { taken, steps } = latest.current!;
      const now: Sample = { at: Date.now(), taken };
      // Fewer steps than before is a new job (the level changed): start the rate over.
      if (!start || taken < start.taken) {
        start = now;
        setLeft(null);
      } else setLeft(remainingMs(start, now, steps));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  return { left: active ? left : null, worked };
}

/**
 * A bar for a review in the making: the pass, "12/68 positions", and a rough
 * time left once a few positions have settled. Gone when the analysis is
 * done; a polite status line still says so, if it was ever seen working.
 */
export function AnalysisProgress({
  analysis,
}: {
  analysis: Pick<GameAnalysis, 'positions' | 'level' | 'unavailable'>;
}) {
  const progress = analysis.unavailable ? null : progressOf(analysis);
  const { left, worked } = useRun(progress);

  if (!progress) {
    return (
      <p role="status" className="sr-only">
        {worked ? 'Analysis complete.' : ''}
      </p>
    );
  }

  const { pass, done, total, taken, steps } = progress;
  const percent = Math.round((taken / steps) * 100);

  return (
    <div className="border-line bg-surface flex flex-col gap-2 rounded-md border-3 px-4 py-3 shadow-md">
      <div className="flex items-baseline justify-between gap-3 text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
        <span>{pass}</span>
        <span className="text-ink-muted font-mono tracking-normal normal-case tabular-nums">
          {done}/{total} positions
          {left !== null && ` · Approx. ${formatRemaining(left)} left`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${pass}: ${done} of ${total} positions`}
        className="border-line bg-surface-alt h-4 overflow-hidden rounded-sm border-3"
      >
        <div
          className="bg-accent h-full transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p role="status" className="sr-only">
        {`Analysis ${Math.floor(percent / ANNOUNCE_EVERY) * ANNOUNCE_EVERY}% done.`}
      </p>
    </div>
  );
}
