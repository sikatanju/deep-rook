import { useEffect, useRef } from 'react';

import type { Ply } from '@/lib/chess/replay';
import { cn } from '@/lib/utils';

export function MoveList({
  plies,
  index,
  onSelect,
}: {
  plies: Ply[];
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
    return (
      <button
        ref={selected ? active : undefined}
        type="button"
        aria-current={selected ? 'step' : undefined}
        onClick={() => onSelect(ply + 1)}
        className={cn(
          'focus-visible:ring-ring rounded px-2 py-1 text-left font-mono text-sm outline-none focus-visible:ring-2',
          selected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        )}
      >
        {move.san}
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
