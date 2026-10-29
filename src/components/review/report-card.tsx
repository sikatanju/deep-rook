import { ChevronDownIcon } from 'lucide-react';

import { GradeSticker } from '@/components/review/grade-sticker';
import { CLASSIFICATIONS, type Classification } from '@/lib/analysis/classify';
import type { GameReport, PlayerReport } from '@/lib/analysis/report';
import { cn } from '@/lib/utils';

/** The nothing-graded half: every slot the streaming report will fill in. */
const UNGRADED: PlayerReport = {
  accuracy: null,
  gradedPlies: 0,
  counts: Object.fromEntries(
    (Object.keys(CLASSIFICATIONS) as Classification[]).map((grade) => [
      grade,
      0,
    ]),
  ) as Record<Classification, number>,
};

const GRADES = Object.keys(CLASSIFICATIONS) as Classification[];

type Who = { name?: string; rating?: string };

/**
 * Whole-game summary of the analysis: both players' accuracy as big mono
 * numerals, a count of every grade (White left, Black right), and the
 * jump-to moments, collapsed until opened. The one card per screen that gets
 * the 4px border and the biggest shadow. Keeps its layout while `report` is
 * null (before the first analyzer flush) so the page does not jump: the
 * accuracy slots show ellipses, every count renders its zero, and the open
 * moments list holds its height. Reads back through data-* attributes only,
 * like the board and engine panel.
 */
export function ReportCard({
  report,
  onJump,
  level,
  white: whoWhite,
  black: whoBlack,
}: {
  report: GameReport | null;
  onJump: (index: number) => void;
  /** The review badge, e.g. "Balanced review" or "Fast review, depth 9". */
  level?: string;
  white?: Who;
  black?: Who;
}) {
  const white = report?.white ?? UNGRADED;
  const black = report?.black ?? UNGRADED;
  const moments = report?.keyMoments ?? [];

  const player = (
    color: 'w' | 'b',
    word: string,
    who: Who | undefined,
    half: PlayerReport,
  ) => (
    <div className="p-4 text-center">
      <p className="truncate font-extrabold">
        {who?.name ?? word}
        {who?.rating && (
          <span className="text-ink-muted ml-1.5 font-mono font-bold">
            ({who.rating})
          </span>
        )}
      </p>
      <span
        data-accuracy={color}
        aria-label={`${word} accuracy estimate`}
        className={cn(
          'border-line my-2 inline-block rounded-sm border-3 px-3 py-2 font-mono text-[40px] leading-none font-bold tracking-[-0.04em] tabular-nums shadow-md',
          color === 'w'
            ? 'bg-eval-white text-sticker-ink'
            : 'bg-eval-black text-white',
        )}
      >
        {half.accuracy?.toFixed(1) ?? '…'}
      </span>
      <p className="text-ink-muted text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
        Accuracy (est.)
      </p>
    </div>
  );

  const count = (
    color: 'w' | 'b',
    grade: Classification,
    half: PlayerReport,
  ) => {
    const n = half.counts[grade] ?? 0;
    return (
      <span data-color={color} className="p-1 text-center">
        <span
          data-grade={grade}
          data-count={n}
          className={cn(
            'font-mono font-bold tabular-nums',
            n === 0 && 'text-ink-muted',
          )}
        >
          {n}
        </span>
      </span>
    );
  };

  return (
    <section
      aria-label="Game report"
      className="border-line bg-surface overflow-hidden rounded-md border-4 shadow-xl"
    >
      <header className="border-line bg-accent text-sticker-ink flex items-center justify-between gap-3 border-b-3 px-4 py-3">
        <h3 className="font-display text-xl leading-6 font-extrabold">
          Game report
        </h3>
        {level && (
          <span className="text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
            {level}
          </span>
        )}
      </header>

      <div className="border-line [&>*+*]:border-line grid grid-cols-2 border-b-3 [&>*+*]:border-l-3">
        {player('w', 'White', whoWhite, white)}
        {player('b', 'Black', whoBlack, black)}
      </div>

      <div className="border-line grid grid-cols-[1fr_auto_1fr] items-center border-b-3 py-1">
        {GRADES.map((grade) => (
          <div key={grade} className="contents">
            {count('w', grade, white)}
            <GradeSticker grade={grade} className="my-0.5 shadow-none" />
            {count('b', grade, black)}
          </div>
        ))}
      </div>

      <details className="group px-4 py-3">
        <summary className="flex cursor-pointer items-center gap-1.5 rounded-sm text-xs leading-4 font-extrabold tracking-[0.08em] uppercase [&::-webkit-details-marker]:hidden">
          <span>Key moments</span>
          <span className="text-ink-muted font-mono tabular-nums">
            {report ? moments.length : '…'}
          </span>
          <ChevronDownIcon
            aria-hidden
            className="ml-auto size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        {/* Five rows reserved: the report keeps at most five moments, so the
            card reaches its final height on the first flush and never jumps. */}
        <div className="mt-2 min-h-32">
          {moments.length > 0 ? (
            <ol className="flex flex-col gap-1">
              {moments.map((moment) => (
                <li key={moment.index}>
                  <button
                    type="button"
                    onClick={() => onJump(moment.index)}
                    className="hover:border-line hover:bg-surface-alt flex w-full cursor-pointer items-center gap-2 rounded-sm border-2 border-transparent px-1.5 py-1 text-left"
                  >
                    {/* One text node: accessible-name computation trims
                        whitespace at element boundaries, so a split
                        "16." + "Qb8" would name the button "16.Qb8". */}
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {`${moment.moveNumber}${moment.color === 'w' ? '.' : '…'} ${moment.san}`}
                    </span>
                    <GradeSticker grade={moment.grade} iconOnly />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-ink-muted px-1.5 py-1">
              {report ? 'None' : '…'}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
