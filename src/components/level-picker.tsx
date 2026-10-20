import {
  ANALYSIS_LEVELS,
  LEVELS,
  rank,
  type AnalysisLevel,
} from '@/lib/analysis/levels';
import { cn } from '@/lib/utils';

/**
 * Review mode as three cards, each with a 1–3 bar strength meter. The chosen
 * card fills with `primary`, lifts and tilts. Real radios underneath, so the
 * arrow keys and form semantics are the browser's. `compact` drops the blurb
 * (show the chosen one's yourself) for tight places: the games setup and the
 * review sidebar.
 */
export function LevelPicker({
  value,
  onChange,
  name,
  legend = 'Review mode',
  compact = false,
}: {
  value: AnalysisLevel;
  onChange: (level: AnalysisLevel) => void;
  /** Radio group name; unique per picker on a page. */
  name: string;
  legend?: string;
  compact?: boolean;
}) {
  return (
    <fieldset className="@container m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      <div
        className={cn(
          'grid gap-3',
          compact ? 'grid-cols-3' : 'grid-cols-1 @lg:grid-cols-3',
        )}
      >
        {LEVELS.map((level) => (
          <label
            key={level}
            title={ANALYSIS_LEVELS[level].blurb}
            className={cn(
              'border-line bg-surface text-ink has-[:checked]:bg-primary has-[:checked]:text-sticker-ink has-[:focus-visible]:outline-focus relative flex cursor-pointer flex-col gap-2 rounded-sm border-3 text-left shadow-sm transition-[translate,box-shadow,rotate] duration-[80ms] ease-in-out hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md has-[:checked]:-translate-x-[3px] has-[:checked]:-translate-y-[3px] has-[:checked]:-rotate-1 has-[:checked]:shadow-lg has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2',
              compact ? 'p-2.5' : 'p-4',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === level}
              onChange={() => onChange(level)}
            />
            <span
              className={cn(
                'font-display font-extrabold',
                compact ? 'text-base' : 'text-xl',
              )}
            >
              {ANALYSIS_LEVELS[level].label}
            </span>
            <span aria-hidden className="flex gap-1">
              {LEVELS.map((l) => (
                <i
                  key={l}
                  className={cn(
                    'h-2.5 w-[18px] border-2 border-current',
                    rank(l) <= rank(level) && 'bg-current',
                  )}
                />
              ))}
            </span>
            {!compact && (
              <span className="text-[13px] leading-[18px]">
                {ANALYSIS_LEVELS[level].blurb}
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
