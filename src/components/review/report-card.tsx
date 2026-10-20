import { ChevronDownIcon } from 'lucide-react';

import { CLASSIFICATIONS, type Classification } from '@/lib/analysis/classify';
import type { GameReport, PlayerReport } from '@/lib/analysis/report';
import { cn } from '@/lib/utils';

import { GradeBadge } from './move-list';

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

/**
 * Whole-game summary of the analysis: accuracy estimates, per-grade counts,
 * and jump-to moments, collapsed until opened. Keeps its layout while `report`
 * is null (before the first analyzer flush) so the review card does not jump:
 * the accuracy slots show ellipses, both nine-cell count grids render their
 * zeros, and the open moments list holds its height. Reads back through data-*
 * attributes only, like the board and engine panel.
 */
export function ReportCard({
  report,
  onJump,
}: {
  report: GameReport | null;
  onJump: (index: number) => void;
}) {
  const white = report?.white ?? UNGRADED;
  const black = report?.black ?? UNGRADED;
  const moments = report?.keyMoments ?? [];

  return (
    <section aria-label="Game report" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium opacity-70">Accuracy (est.)</p>
        <div className="flex items-baseline gap-3">
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs opacity-70">White</span>
            <span
              data-accuracy="w"
              aria-label="White accuracy estimate"
              className="font-mono text-xl font-semibold tabular-nums"
            >
              {white.accuracy?.toFixed(1) ?? '…'}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs opacity-70">Black</span>
            <span
              data-accuracy="b"
              aria-label="Black accuracy estimate"
              className="font-mono text-xl font-semibold tabular-nums"
            >
              {black.accuracy?.toFixed(1) ?? '…'}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium opacity-70">Move quality</p>
        {(
          [
            ['w', 'White', white],
            ['b', 'Black', black],
          ] as const
        ).map(([color, name, half]) => (
          <div
            key={color}
            data-color={color}
            className="flex items-center gap-2"
          >
            <span className="w-9 shrink-0 text-xs opacity-70">{name}</span>
            <div className="flex flex-1 items-center justify-between">
              {(Object.keys(CLASSIFICATIONS) as Classification[]).map(
                (grade) => {
                  const count = half.counts[grade] ?? 0;
                  const {
                    label,
                    symbol,
                    color: gradeColor,
                  } = CLASSIFICATIONS[grade];
                  return (
                    <span
                      key={grade}
                      data-grade={grade}
                      data-count={count}
                      title={label}
                      className="flex items-center gap-0.5"
                    >
                      <span
                        aria-hidden
                        className="text-[10px] leading-none font-bold"
                        style={{ color: gradeColor }}
                      >
                        {symbol}
                      </span>
                      <span
                        className={cn(
                          'font-mono text-xs tabular-nums',
                          count === 0 && 'opacity-50',
                        )}
                      >
                        {count}
                      </span>
                    </span>
                  );
                },
              )}
            </div>
          </div>
        ))}
      </div>

      <details className="group">
        <summary className="focus-visible:ring-ring flex cursor-pointer items-center gap-1.5 rounded text-xs font-medium outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          <span className="opacity-70">Key moments</span>
          <span className="font-mono tabular-nums opacity-50">
            {report ? moments.length : '…'}
          </span>
          <ChevronDownIcon
            aria-hidden
            className="ml-auto size-3.5 opacity-70 transition-transform group-open:rotate-180"
          />
        </summary>
        {/* Five rows reserved: the report keeps at most five moments, so the
            card reaches its final height on the first flush and never jumps. */}
        <div className="mt-1 min-h-28">
          {moments.length > 0 ? (
            <ol className="flex flex-col gap-0.5">
              {moments.map((moment) => (
                <li key={moment.index}>
                  <button
                    type="button"
                    onClick={() => onJump(moment.index)}
                    className="focus-visible:ring-ring hover:bg-accent flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm outline-none focus-visible:ring-2"
                  >
                    {/* One text node: accessible-name computation trims
                        whitespace at element boundaries, so a split
                        "16." + "Qb8" would name the button "16.Qb8". */}
                    <span className="font-mono text-sm tabular-nums">
                      {`${moment.moveNumber}${moment.color === 'w' ? '.' : '…'} ${moment.san}`}
                    </span>
                    <GradeBadge grade={moment.grade} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-1.5 py-1 text-sm opacity-50">
              {report ? 'None' : '…'}
            </p>
          )}
        </div>
      </details>

      {report && (
        <p className="text-xs opacity-60">
          {report.settled}/{report.total} positions
        </p>
      )}
    </section>
  );
}
