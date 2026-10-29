import { CLASSIFICATIONS, type Classification } from '@/lib/analysis/classify';
import { cn } from '@/lib/utils';

// Written out in full so Tailwind sees every class. The fills are fixed across
// palettes: a blunder always looks like a blunder.
const FILL: Record<Classification, string> = {
  brilliant: 'bg-grade-brilliant',
  great: 'bg-grade-great',
  best: 'bg-grade-best',
  excellent: 'bg-grade-excellent',
  good: 'bg-grade-good',
  inaccuracy: 'bg-grade-inaccuracy',
  mistake: 'bg-grade-mistake',
  miss: 'bg-grade-miss',
  blunder: 'bg-grade-blunder',
};

/**
 * A move grade as a sticker: glyph tile plus UPPERCASE label on the grade's
 * colour. `iconOnly` keeps the glyph for dense places (the board corner, the
 * move list). Tilt only stickers that sit alone; keep list ones straight.
 */
export function GradeSticker({
  grade,
  iconOnly = false,
  tilt,
  label,
  className,
}: {
  grade: Classification;
  iconOnly?: boolean;
  /** Degrees. */
  tilt?: number;
  /** Replaces the grade's word. */
  label?: string;
  className?: string;
}) {
  const { label: word, symbol } = CLASSIFICATIONS[grade];
  const text = label ?? word;
  return (
    <span
      data-grade={grade}
      role={iconOnly ? 'img' : undefined}
      aria-label={iconOnly ? text : undefined}
      title={iconOnly ? text : undefined}
      className={cn(
        'border-line text-sticker-ink inline-flex items-center gap-1 rounded-sm border-2',
        FILL[grade],
        iconOnly ? 'p-0' : 'py-0.5 pr-2 pl-1',
        className,
      )}
      style={tilt ? { rotate: `${tilt}deg` } : undefined}
    >
      <span
        aria-hidden
        className={cn(
          'grid h-5 min-w-[22px] place-items-center rounded-[4px] px-[3px] font-mono text-xs font-bold',
          iconOnly ? 'text-sticker-ink' : 'bg-sticker-ink text-white',
        )}
      >
        {symbol}
      </span>
      {!iconOnly && <span className="text-xs leading-4 font-bold">{text}</span>}
    </span>
  );
}
