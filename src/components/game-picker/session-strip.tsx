import { cn } from '@/lib/utils';

export type SessionResult = 'W' | 'L' | 'D';

const FILL: Record<SessionResult, string> = {
  W: 'bg-win',
  L: 'bg-loss',
  D: 'bg-draw',
};

const WORD: Record<SessionResult, string> = {
  W: 'won',
  L: 'lost',
  D: 'drawn',
};

/** Blocks for one glance. Older games stay in the totals and the list below. */
const LATEST = 15;

/**
 * A day's games at a glance: one block per game, oldest to newest, each with
 * its letter so colour is never the only signal. A longer day shows its latest
 * 15 blocks. The totals, the rating change across the day and a ▲ over the
 * peak still cover the whole day. The mark appears only when that game is one
 * of the blocks on show.
 *
 * `ratings` are the player's rating after each game, in the same order. The
 * change runs from after the first game to after the last: Chess.com gives no
 * rating from before it.
 */
export function SessionStrip({
  results,
  ratings,
}: {
  results: readonly SessionResult[];
  ratings?: readonly number[];
}) {
  const count = (r: SessionResult) => results.filter((x) => x === r).length;
  const [won, lost, drawn] = [count('W'), count('L'), count('D')];
  const hasRatings = ratings && ratings.length === results.length;
  const peakRating = hasRatings ? Math.max(...ratings) : null;
  const peak = hasRatings ? ratings.lastIndexOf(peakRating!) : -1;
  const net =
    hasRatings && ratings.length > 1 ? ratings.at(-1)! - ratings[0]! : null;
  const shown = results.slice(-LATEST);
  const hidden = results.length - shown.length;
  const peakShown = peak - hidden;
  const shownLabel = (r: SessionResult) => shown.filter((x) => x === r).length;
  const label =
    hidden === 0
      ? `${results.length} games: ${won} ${WORD.W}, ${lost} ${WORD.L}, ${drawn} ${WORD.D}`
      : `Latest ${shown.length} of ${results.length} games: ${shownLabel('W')} ${WORD.W}, ${shownLabel('L')} ${WORD.L}, ${shownLabel('D')} ${WORD.D}`;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={label}
        className="border-line bg-line mt-4 flex flex-wrap gap-y-5 border-3 shadow-md"
      >
        {shown.map((r, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              'border-line text-sticker-ink relative grid h-10 min-w-[18px] flex-1 place-items-center border-r-2 font-mono text-[13px] font-bold last:border-r-0',
              FILL[r],
              i === peakShown &&
                "after:text-ink after:absolute after:-top-[18px] after:text-[11px] after:content-['▲']",
            )}
          >
            {r}
          </span>
        ))}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-4">
        <Stat label="Won" value={won} />
        <Stat label="Lost" value={lost} />
        <Stat label="Drawn" value={drawn} />
        {net !== null && (
          <Stat label="Net" value={`${net > 0 ? '+' : ''}${net}`} />
        )}
        {peakRating !== null && <Stat label="Peak" value={peakRating} />}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-ink-muted text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
        {label}
      </span>
      <b className="font-mono text-xl">{value}</b>
    </span>
  );
}
