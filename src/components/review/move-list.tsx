import { useEffect, useRef } from 'react';

import { CLASSIFICATIONS, type Classification } from '@/lib/analysis/classify';
import type { Ply } from '@/lib/chess/replay';
import { cn } from '@/lib/utils';

export function GradeBadge({ grade }: { grade: Classification }) {
  const { label, symbol, color } = CLASSIFICATIONS[grade];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-grid h-4 min-w-4 place-items-center rounded-full px-0.5 font-sans text-[10px] leading-none font-bold text-white"
      style={{ background: color }}
    >
      {symbol}
    </span>
  );
}

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

  const rows = Array.from({ length: Math.ceil(plies.length / 2) }, (_, i) => i);
  const cell = (ply: number) => {
    const move = plies[ply];
    if (!move) return <span />;
    const selected = index === ply + 1;
    const grade = grades[ply];
    return (
      <button
        ref={selected ? active : undefined}
        type="button"
        aria-current={selected ? 'step' : undefined}
        onClick={() => onSelect(ply + 1)}
        className={cn(
          'focus-visible:ring-ring flex items-center justify-between gap-1 rounded px-2 py-1 text-left font-mono text-sm outline-none focus-visible:ring-2',
          selected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        )}
      >
        {move.san}
        {grade && <GradeBadge grade={grade} />}
      </button>
    );
  };

  return (
    <ol className="grid grid-cols-[2.5rem_1fr_1fr] content-start gap-y-0.5">
      {rows.map((row) => (
        <li key={row} className="contents">
          <span className="py-1 pr-1 text-right font-mono text-sm opacity-50">
            {row + 1}.
          </span>
          {cell(row * 2)}
          {cell(row * 2 + 1)}
        </li>
      ))}
    </ol>
  );
}
