import type { AnalysisPhase } from '@/lib/analysis/report';
import { cn } from '@/lib/utils';

const PHASES = [
  ['focus', 'Focus'],
  ['first-light', 'First light'],
  ['upgrade', 'Upgrades'],
] as const;

/**
 * Progress of the background review: a striped bar (positions analysed out of
 * all) and the three phases of the work, Focus → First light → Upgrades, with
 * the open one lit and the finished ones struck through. When every position
 * is settled the bar turns `win` and stops moving. `phase` is left out when
 * no phase applies (the engine cannot run here).
 */
export function AnalysisMeter({
  done,
  total,
  phase,
  label,
}: {
  done: number;
  total: number;
  phase?: AnalysisPhase;
  /** Replaces the "done / total positions" line. */
  label?: string;
}) {
  const complete = total > 0 && done >= total;
  const percent = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const current = PHASES.findIndex(([id]) => id === phase);
  return (
    <div
      data-done={complete}
      role="progressbar"
      aria-label="Analysis progress"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={label ?? `${done} of ${total} positions analyzed`}
      className="group flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
          {complete ? 'Analysis done' : 'Analyzing'}
        </span>
        <span className="font-mono text-xs font-bold">
          {label ?? `${done}/${total} positions`}
        </span>
      </div>
      <div className="border-line bg-surface-alt relative h-[26px] overflow-hidden rounded-sm border-3 shadow-sm">
        <div
          className={cn(
            'border-line absolute inset-y-0 left-0 border-r-3 transition-[width] duration-300 ease-in-out',
            complete
              ? 'bg-win'
              : 'animate-stripes bg-[repeating-linear-gradient(-45deg,var(--pop-3)_0_10px,var(--primary)_10px_20px)] bg-[length:28px_28px]',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="flex flex-wrap gap-2">
        {PHASES.map(([id, name], i) => {
          const state =
            complete || i < current ? 'done' : i === current ? 'on' : 'next';
          return (
            <li
              key={id}
              aria-current={state === 'on' ? 'step' : undefined}
              className={cn(
                'rounded-pill border-line border-2 px-2 text-xs leading-4 font-extrabold tracking-[0.08em] uppercase',
                state === 'on' && 'bg-primary text-sticker-ink',
                state === 'done' && 'bg-surface-alt line-through',
                state === 'next' && 'text-ink-muted',
              )}
            >
              {name}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
