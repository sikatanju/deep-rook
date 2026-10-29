import { useEffect, useRef } from 'react';

import { GradeSticker } from '@/components/review/grade-sticker';
import type { Classification } from '@/lib/analysis/classify';
import type { Ply } from '@/lib/chess/replay';
import { cn } from '@/lib/utils';

/** Only these get a chip, so the list stays scannable. */
const CHIPPED = new Set<Classification>([
  'brilliant',
  'great',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
]);

export function MoveList({
  plies,
  grades,
  index,
  onSelect,
}: {
  plies: Ply[];
  /** Per ply, from classifyMoves. */
  grades: readonly (Classification | null)[];
  /** 0 is the start position, n is after ply n. */
  index: number;
  onSelect: (index: number) => void;
}) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);

  // A game set up with Black to move opens on a row with an empty White cell.
  const rows: { number: number; w?: number; b?: number }[] = [];
  plies.forEach((ply, i) => {
    if (ply.color === 'w' || rows.length === 0) {
      rows.push({ number: ply.moveNumber });
    }
    rows.at(-1)![ply.color] = i;
  });
  const cell = (ply: number | undefined) => {
    if (ply === undefined)
      return <span className="border-line border-b border-dashed" />;
    const move = plies[ply]!;
    const selected = index === ply + 1;
    const grade = grades[ply];
    return (
      <button
        ref={selected ? active : undefined}
        type="button"
        aria-current={selected ? 'step' : undefined}
        onClick={() => onSelect(ply + 1)}
        className={cn(
          'border-line flex cursor-pointer items-center justify-between gap-1.5 border-b border-dashed px-2 py-1 text-left font-mono text-sm font-bold',
          selected
            ? 'bg-primary text-sticker-ink shadow-[inset_0_0_0_2px_var(--line)]'
            : 'hover:bg-surface-alt',
        )}
      >
        {move.san}
        {grade && CHIPPED.has(grade) && (
          <GradeSticker grade={grade} iconOnly className="scale-90" />
        )}
      </button>
    );
  };

  return (
    <ol className="grid grid-cols-[2.5rem_1fr_1fr] content-start">
      {rows.map((row) => (
        <li key={row.number} className="contents">
          <span className="border-line bg-surface-alt text-ink-muted border-b border-dashed p-1.5 text-right font-mono text-xs shadow-[inset_-2px_0_0_var(--line)]">
            {row.number}.
          </span>
          {cell(row.w)}
          {cell(row.b)}
        </li>
      ))}
    </ol>
  );
}
