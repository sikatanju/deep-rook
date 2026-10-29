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
    <div
      role="group"
      aria-label={`${color === 'w' ? 'White' : 'Black'} player`}
      className="flex h-13 items-center gap-3 px-1"
    >
      <span
        aria-hidden
        className={cn(
          'border-line size-4 flex-none border-2',
          color === 'w' ? 'bg-eval-white' : 'bg-eval-black',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold">
          {name}
          {rating && (
            <span className="text-ink-muted ml-1.5 font-mono font-bold">
              ({rating})
            </span>
          )}
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
          {lead > 0 && (
            <span className="ml-2 font-mono font-bold">+{lead}</span>
          )}
        </p>
      </div>
      {clock !== undefined && (
        <span
          className={cn(
            'border-line rounded-sm border-2 px-2 py-1 font-mono text-sm font-bold tabular-nums',
            toMove ? 'bg-primary text-primary-foreground' : 'bg-surface-alt',
          )}
        >
          {formatClock(clock)}
        </span>
      )}
    </div>
  );
}
