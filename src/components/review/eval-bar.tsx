import { winPercent, type Score } from '@/lib/chess/score';
import { cn } from '@/lib/utils';

function barLabel(score: Score): string {
  if (score.kind === 'mate') return score.moves === 0 ? '#' : `M${score.moves}`;
  return (Math.abs(score.cp) / 100).toFixed(1);
}

/**
 * White's winning chances as a vertical bar beside the board. White fills
 * from White's side of the board, and the label sits at the winning side's
 * end. With no score yet the bar rests level and unlabelled.
 */
export function EvalBar({
  score,
  flipped,
}: {
  score: Score | null;
  flipped: boolean;
}) {
  const win = score ? winPercent(score) : 50;
  const whiteEnd = flipped ? 'top' : 'bottom';
  const blackEnd = flipped ? 'bottom' : 'top';
  const whiteLeads =
    score?.kind === 'mate' ? score.winner === 'w' : (score?.cp ?? 0) >= 0;

  return (
    <div
      role="meter"
      aria-label="White's winning chances"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(win)}
      className="relative overflow-hidden rounded-sm bg-neutral-800"
    >
      <div
        data-fill=""
        className="absolute inset-x-0 bg-neutral-100 transition-[height] duration-300 ease-out"
        style={{ [whiteEnd]: 0, height: `${win}%` }}
      />
      {score && (
        <span
          className={cn(
            'absolute inset-x-0 text-center text-[10px] leading-none font-semibold tabular-nums',
            whiteLeads ? 'text-neutral-800' : 'text-neutral-100',
          )}
          style={{ [whiteLeads ? whiteEnd : blackEnd]: '0.375rem' }}
        >
          {barLabel(score)}
        </span>
      )}
    </div>
  );
}
