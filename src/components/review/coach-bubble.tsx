import type { ReactNode } from 'react';

import { CLASSIFICATIONS, type Classification } from '@/lib/analysis/classify';
import { cn } from '@/lib/utils';

import { GradeSticker } from './grade-sticker';

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** A move the engine names instead of the one played. */
type EngineChoice = {
  /** SAN, e.g. "Nf3". */
  san: string;
  /** Already formatted: "+0.4". */
  eval?: string;
};

function Choice({
  icon,
  label,
  choice,
}: {
  icon: ReactNode;
  label: string;
  choice: EngineChoice;
}) {
  return (
    <p className="flex items-center gap-2">
      {icon}
      <span>
        {label} <span className="font-mono">{choice.san}</span>
        {choice.eval && (
          <span className="text-ink-muted font-mono"> ({choice.eval})</span>
        )}
      </span>
    </p>
  );
}

/**
 * The coach: a rook tile and a speech bubble that says what just happened in
 * plain, punchy words. `title` is one line in the coach's voice (cheeky, never
 * mean), the children are the plain sentence or two behind it. One bubble per
 * screen; it replaces explanatory text, so don't repeat its words elsewhere.
 *
 * With a `move` the bubble leads with a verdict the way chess.com's review
 * does: grade glyph, "1… e6 is best", the eval pushed to the far edge.
 */
export function CoachBubble({
  grade,
  move,
  eval: score,
  best,
  next,
  title,
  actions,
  children,
  className,
}: {
  grade?: Classification;
  /** SAN with its number, e.g. "16. Qb8+". */
  move?: string;
  /** Already formatted: "+1.4", "M2". */
  eval?: string;
  /** The engine's preferred move, when it is not the one played. */
  best?: EngineChoice;
  /** The engine's next best move, when it is not the one played. */
  next?: EngineChoice;
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const word = grade && CLASSIFICATIONS[grade].label.toLowerCase();
  const eval_ = score && (
    <span className="border-line bg-surface-alt ml-auto flex-none rounded-sm border-2 px-1.5 font-mono text-sm font-bold">
      {score}
    </span>
  );
  return (
    <section
      aria-label="Coach"
      className={cn(
        'border-line bg-surface overflow-hidden rounded-md border-3 shadow-lg',
        className,
      )}
    >
      <header className="border-line bg-surface-alt flex min-h-12 items-center gap-3 border-b-3 px-3 py-2">
        <span
          aria-hidden
          className="border-line bg-pop-3 text-sticker-ink grid size-8 flex-none place-items-center rounded-sm border-2 text-xl leading-none shadow-sm"
        >
          ♜
        </span>
        {move && grade && word ? (
          <>
            <GradeSticker grade={grade} iconOnly className="flex-none" />
            <p className="font-display min-w-0 text-lg leading-6 font-extrabold">
              <span className="font-mono">{move}</span> is {article(word)}{' '}
              {word}
            </p>
          </>
        ) : grade ? (
          <GradeSticker grade={grade} />
        ) : (
          <p className="text-ink-muted text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
            Coach
          </p>
        )}
        {eval_}
      </header>
      <div className="px-4 py-3">
        <p className="font-display mb-1 text-xl leading-6 font-extrabold">
          {title}
        </p>
        {children && <p className="text-ink-muted">{children}</p>}
        {(best || next) && (
          <div className="mt-2 grid gap-1 font-bold">
            {best && (
              <Choice
                icon={
                  <GradeSticker grade="best" iconOnly className="scale-90" />
                }
                label="Best was"
                choice={best}
              />
            )}
            {next && (
              <Choice
                // The best sticker's footprint, neutral: a rank, not a grade.
                icon={
                  <span
                    aria-hidden
                    className="border-line bg-surface-alt grid h-6 min-w-[26px] scale-90 place-items-center rounded-sm border-2 px-[3px] font-mono text-xs font-bold shadow-sm"
                  >
                    2
                  </span>
                }
                label="Next best was"
                choice={next}
              />
            )}
          </div>
        )}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}
