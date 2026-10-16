import { Piece } from '@/components/board/board';
import { formatClock } from '@/lib/chess/replay';
import { cn } from '@/lib/utils';

export function PlayerStrip({
  name,
  rating,
  color,
  captured,
  lead,
  clock,
  toMove,
}: {
  name: string;
  rating?: string;
  color: 'w' | 'b';
  /** Piece types this player has captured. */
  captured: string[];
  /** Material lead in pawns, 0 when level or behind. */
  lead: number;
  clock?: number;
  toMove: boolean;
}) {
  return (
    <div className="flex h-13 items-center gap-3 px-1">
      <span
        aria-hidden
        className={cn(
          'size-3 rounded-sm border',
          color === 'w' ? 'bg-white' : 'bg-neutral-900',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name}
          {rating && <span className="ml-1.5 opacity-60">({rating})</span>}
        </p>
        <p className="flex h-5 items-center text-xs" aria-label="Captured">
          {captured.map((type, i) => (
            <Piece
              key={i}
              type={type}
              white={color === 'b'}
              className="-mr-1.5 size-5"
            />
          ))}
          {lead > 0 && <span className="ml-2 opacity-70">+{lead}</span>}
        </p>
      </div>
      {clock !== undefined && (
        <span
          className={cn(
            'rounded px-2 py-1 font-mono text-sm tabular-nums',
            toMove ? 'bg-foreground text-background' : 'bg-muted',
          )}
        >
          {formatClock(clock)}
        </span>
      )}
    </div>
  );
}
