// Time per move, drawn under the eval graph on the same x axis: the bar for a
// move spans the graph from the position before it to the position after, so
// a long think sits right under the swing it caused.

import { formatSpent, type MoveClock } from '@/lib/chess/clock';
import type { Ply } from '@/lib/chess/replay';

const WIDTH = 1000;
const HEIGHT = 40;
const GAP = 0.15;
/** Moves in time trouble are quick ones, so every bar keeps enough height to show its color. */
const MIN_BAR = 5;

const fixed = (n: number) => n.toFixed(2);

const moveName = (ply: Ply) =>
  `${ply.moveNumber}${ply.color === 'w' ? '.' : '…'} ${ply.san}`;

export function MoveTimes({
  plies,
  clocks,
  index,
}: {
  plies: readonly Ply[];
  /** Per ply, from moveClocks. */
  clocks: readonly (MoveClock | null)[];
  /** The viewer's position, for the cursor. */
  index: number;
}) {
  const slot = WIDTH / Math.max(1, plies.length);
  const longest = clocks.reduce<number | null>(
    (best, c, p) =>
      c && (best === null || c.spent > clocks[best]!.spent) ? p : best,
    null,
  );
  if (longest === null) return null;
  const top = Math.max(1, clocks[longest]!.spent);
  const trouble = (color: 'w' | 'b') =>
    clocks.filter((c, p) => c?.trouble && plies[p]!.color === color).length;
  const summary = `Time per move. Longest think ${moveName(plies[longest]!)}, ${formatSpent(clocks[longest]!.spent)}. Moves begun in time trouble: White ${trouble('w')}, Black ${trouble('b')}.`;

  return (
    <div className="flex flex-col gap-2">
      <div className="border-line bg-surface-alt border-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={summary}
          className="block h-12 w-full"
        >
          {clocks.map((c, p) => {
            if (!c) return null;
            const height = Math.max(MIN_BAR, (c.spent / top) * HEIGHT);
            return (
              <rect
                key={p}
                data-ply={p}
                data-trouble={c.trouble || undefined}
                x={fixed(p * slot + slot * GAP)}
                y={fixed(HEIGHT - height)}
                width={fixed(slot * (1 - 2 * GAP))}
                height={fixed(height)}
                fill={
                  c.trouble
                    ? 'var(--grade-blunder)'
                    : plies[p]!.color === 'w'
                      ? 'var(--eval-white)'
                      : 'var(--eval-black)'
                }
                stroke="var(--line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <line
            x1={fixed(index * slot)}
            x2={fixed(index * slot)}
            y1={0}
            y2={HEIGHT}
            stroke="var(--primary)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <p className="text-ink-muted text-sm">
        Time per move, White light and Black dark. Red bars began in time
        trouble.
      </p>
    </div>
  );
}
