import { ResultStamp } from '@/components/game-picker/result-stamp';
import type { Outcome } from '@/lib/chesscom/session';
import { cn } from '@/lib/utils';

/** What the saved reviews and the batch say about a listed game. */
export type RowMark = 'reviewed' | 'analyzing';

const MARKS: Record<RowMark, { label: string; className: string }> = {
  reviewed: { label: 'Reviewed', className: 'bg-grade-best' },
  analyzing: { label: 'Analyzing…', className: 'bg-accent' },
};

/**
 * One game in the picker: result stamp, opponent and their rating, time
 * control, your rating after the game, when. The whole row is the button; it
 * lifts on hover and drops flat on press, and fills with `primary` once staged.
 */
export function GameRow({
  result,
  opponent,
  opponentRating,
  playedWhite,
  timeControl,
  myRating,
  when,
  dateTime,
  selected,
  mark,
  onSelect,
}: {
  result: Outcome;
  opponent: string;
  opponentRating: number;
  playedWhite: boolean;
  /** "blitz 180". */
  timeControl: string;
  myRating: number;
  when: string;
  dateTime: string;
  selected: boolean;
  mark?: RowMark;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'border-line text-ink grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-sm border-2 px-3 py-2.5 text-left transition-[translate,box-shadow] duration-[80ms] ease-in-out hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 sm:grid-cols-[72px_minmax(0,1fr)_auto_auto_auto]',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-surface hover:bg-surface-alt',
      )}
    >
      <ResultStamp result={result} />
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-bold">
          <span className="sr-only">
            {playedWhite ? 'White' : 'Black'} against{' '}
          </span>
          {opponent}
          <small className="ml-1.5 font-mono text-xs opacity-80">
            ({opponentRating})
          </small>
        </span>
        {mark && (
          <span
            data-mark={mark}
            className={cn(
              'border-line text-sticker-ink flex-none rounded-sm border-2 px-1.5 text-xs font-bold',
              MARKS[mark].className,
            )}
          >
            {MARKS[mark].label}
          </span>
        )}
      </span>
      <span className="border-line bg-surface-alt text-ink rounded-sm border-2 px-1.5 font-mono text-xs">
        {timeControl}
      </span>
      <span className="hidden font-mono text-sm font-bold sm:inline">
        <span className="sr-only">me </span>
        {myRating}
      </span>
      <time
        dateTime={dateTime}
        className={cn(
          'col-span-3 text-xs whitespace-nowrap sm:col-span-1',
          selected ? 'text-primary-foreground' : 'text-ink-muted',
        )}
      >
        {when}
      </time>
    </button>
  );
}
