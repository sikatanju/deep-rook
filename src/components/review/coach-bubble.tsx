import type { ReactNode } from 'react';

import type { Classification } from '@/lib/analysis/classify';
import { cn } from '@/lib/utils';

import { GradeSticker } from './grade-sticker';

/**
 * The coach: a rook tile and a speech bubble that says what just happened in
 * plain, punchy words. `title` is one line in the coach's voice (cheeky, never
 * mean), the children are the plain sentence or two behind it. One bubble per
 * screen; it replaces explanatory text, so don't repeat its words elsewhere.
 */
export function CoachBubble({
  grade,
  move,
  eval: score,
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
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label="Coach" className={cn('@container', className)}>
      {/* A container query: the bubble answers to the room it is given, not the
          screen. Narrow, the tile sits above it and the tail goes; wide, they sit
          side by side. */}
      <div className="flex flex-col items-start gap-4 @min-[18rem]:flex-row @min-[18rem]:gap-3">
        <span
          aria-hidden
          className="border-line bg-pop-3 text-sticker-ink grid size-12 flex-none rotate-[4deg] place-items-center rounded-sm border-3 text-3xl leading-none shadow-sm"
        >
          ♜
        </span>
        <div className="border-line bg-surface before:border-line before:bg-surface relative w-full min-w-0 flex-1 rounded-md border-3 px-4 py-3 shadow-lg before:hidden before:content-[''] @min-[18rem]:before:absolute @min-[18rem]:before:top-4 @min-[18rem]:before:-left-3 @min-[18rem]:before:block @min-[18rem]:before:size-[18px] @min-[18rem]:before:rotate-45 @min-[18rem]:before:border-b-3 @min-[18rem]:before:border-l-3">
          {(grade || move || score) && (
            <div className="flex flex-wrap items-center gap-2">
              {grade && <GradeSticker grade={grade} tilt={-2} />}
              {move && (
                <span className="font-mono text-sm font-bold">{move}</span>
              )}
              {score && (
                <span className="border-line bg-surface-alt rounded-sm border-2 px-1.5 font-mono text-sm font-bold">
                  {score}
                </span>
              )}
            </div>
          )}
          <p className="font-display mt-2 mb-1 text-xl leading-6 font-extrabold">
            {title}
          </p>
          {children && <p className="text-ink-muted">{children}</p>}
          {actions && (
            <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
          )}
        </div>
      </div>
    </section>
  );
}
