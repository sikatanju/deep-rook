import { winPercent, type Score } from '@/lib/chess/score';
import { cn } from '@/lib/utils';

function barLabel(score: Score): string {
  if (score.kind === 'mate') return score.moves === 0 ? '#' : `M${score.moves}`;
  return (Math.abs(score.cp) / 100).toFixed(1);
}

/**
 * White's winning chances as a bar: vertical beside the board, horizontal
 * under it on small screens and in the settings preview. White fills from
 * White's side of the board, and the label sits at the winning side's end.
 * With no score yet the bar rests level and unlabelled. A vertical bar takes
 * its height from the row it stretches in; a horizontal one its width.
 */
export function EvalBar({
  score,
  flipped,
  orientation = 'vertical',
  className,
}: {
  score: Score | null;
  flipped: boolean;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}) {
  const horizontal = orientation === 'horizontal';
  const win = score ? winPercent(score) : 50;
  const [whiteEnd, blackEnd] = horizontal
    ? flipped
      ? (['right', 'left'] as const)
      : (['left', 'right'] as const)
    : flipped
      ? (['top', 'bottom'] as const)
      : (['bottom', 'top'] as const);
  const whiteLeads =
    score?.kind === 'mate' ? score.winner === 'w' : (score?.cp ?? 0) >= 0;
  // The outline sits on the edge where White's share meets Black's.
  const seam = {
    left: 'border-r-2',
    right: 'border-l-2',
    top: 'border-b-2',
    bottom: 'border-t-2',
  }[whiteEnd];

  return (
    <div
      role="meter"
      aria-label="White's winning chances"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(win)}
      className={cn(
        'border-line bg-eval-black relative overflow-hidden border-3 shadow-md',
        horizontal ? 'h-7 w-full' : 'w-7 flex-none',
        className,
      )}
    >
      <div
        data-fill=""
        className={cn(
          'border-line bg-eval-white absolute transition-[height,width] duration-[350ms] ease-[cubic-bezier(0.2,1.4,0.4,1)] motion-reduce:transition-none',
          horizontal ? 'inset-y-0' : 'inset-x-0',
          win > 0 && seam,
        )}
        style={
          horizontal
            ? { [whiteEnd]: 0, width: `${win}%` }
            : { [whiteEnd]: 0, height: `${win}%` }
        }
      />
      {score && (
        <span
          className={cn(
            'absolute font-mono text-[10px] leading-none font-bold tabular-nums',
            horizontal
              ? 'inset-y-0 flex items-center'
              : 'inset-x-0 text-center',
            whiteLeads ? 'text-eval-black' : 'text-eval-white',
          )}
          style={{ [whiteLeads ? whiteEnd : blackEnd]: '0.375rem' }}
        >
          {barLabel(score)}
        </span>
      )}
    </div>
  );
}
