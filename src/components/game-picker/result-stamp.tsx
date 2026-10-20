import type { Outcome } from '@/lib/chesscom/session';
import { cn } from '@/lib/utils';

const STAMP: Record<Outcome, { glyph: string; word: string; style: string }> = {
  win: { glyph: '✓', word: 'Won', style: 'bg-win -rotate-2' },
  loss: { glyph: '✕', word: 'Lost', style: 'bg-loss rotate-2' },
  draw: { glyph: '=', word: 'Draw', style: 'bg-draw' },
};

/**
 * A rubber-stamp result tag. The word and glyph always ship with the colour,
 * so a result never rests on hue alone.
 */
export function ResultStamp({ result }: { result: Outcome }) {
  const { glyph, word, style } = STAMP[result];
  return (
    <span
      className={cn(
        'border-line text-sticker-ink inline-flex items-center justify-center gap-1 rounded-sm border-2 px-2 py-0.5 text-xs leading-4 font-extrabold tracking-[0.08em] whitespace-nowrap uppercase shadow-sm',
        style,
      )}
    >
      <span aria-hidden>{glyph}</span>
      {word}
    </span>
  );
}
