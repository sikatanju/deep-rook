// The eval graph: White's winning chances per position, drawn as a scrub
// control under the board. Hand-rolled SVG like the board's Arrow — jsdom
// applies no cascade and its rects are all zero, so every geometric claim
// lives in an attribute and the pointer math is the exported pure function,
// pinned by tests without any layout.

import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { CLASSIFICATIONS, type Classification } from '@/lib/analysis/classify';

/** The draw area: 1000 wide, 100 tall, y inverted (y = 100 - win%). */
const WIDTH = 1000;
const HEIGHT = 100;

/** Keeps decimals (x(2) of 4 is 666.67, not 667): positions stay honest. */
const fixed = (n: number) => n.toFixed(2);

/**
 * Pointer x (px from the svg's left edge) → nearest position index. The exact
 * inverse of the draw mapping x(i) = (i / (count - 1)) * WIDTH: every drawn x
 * scrubs back to its own index, so the cursor never lands off the pointer.
 * Degenerate geometry (no width to measure, a single point) maps to 0.
 */
export function pointerToIndex(
  x: number,
  width: number,
  count: number,
): number {
  if (width <= 0 || count <= 1) return 0;
  return Math.min(
    count - 1,
    Math.max(0, Math.round((x / width) * (count - 1))),
  );
}

export function EvalGraph({
  series,
  index,
  marks,
  onScrub,
}: {
  /** White's win% per position, aligned with viewer index; null = unsettled. */
  series: readonly (number | null)[];
  /** The viewer's current position: where the cursor line sits. */
  index: number;
  /** Key moments, drawn as dots on the curve in their grade color. */
  marks?: readonly { index: number; grade: Classification }[];
  onScrub: (index: number) => void;
}) {
  const count = series.length;
  const settled = series.reduce<number>((n, v) => n + (v !== null ? 1 : 0), 0);
  const x = (i: number) => (count > 1 ? (i / (count - 1)) * WIDTH : 0);
  const y = (win: number) => HEIGHT - win;
  // Indexing a readonly array admits undefined (noUncheckedIndexedAccess);
  // collapsing it into null keeps one "no point here" code path.
  const point = (i: number) => series[i] ?? null;

  // One polyline per maximal settled run. A null is an honest hole — the
  // engine has not settled what happens there yet — so runs never bridge it.
  const runs: string[][] = [];
  let run: string[] = [];
  for (let i = 0; i < count; i++) {
    const win = point(i);
    if (win === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push(`${fixed(x(i))},${fixed(y(win))}`);
    }
  }
  if (run.length > 0) runs.push(run);

  const drag = useRef(false);
  const scrub = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onScrub(pointerToIndex(e.clientX - rect.left, rect.width, count));
  };

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Evaluation graph, position ${index + 1} of ${count}, ${settled}/${count} analyzed`}
      className="block h-20 w-full touch-none"
      onPointerDown={(e) => {
        // jsdom lacks pointer capture and may throw on a stray pointer id;
        // capture is best-effort, the drag itself must not depend on it.
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // un-captured moves still reach the svg while the pointer is over
          // it, which is where a drag lives anyway.
        }
        drag.current = true;
        scrub(e);
      }}
      onPointerMove={(e) => {
        if (drag.current) scrub(e);
      }}
      onPointerUp={() => {
        drag.current = false;
      }}
      onPointerCancel={() => {
        drag.current = false;
      }}
    >
      {/* The even-game midline, faint under the curve. */}
      <line
        x1="0"
        y1={HEIGHT / 2}
        x2={WIDTH}
        y2={HEIGHT / 2}
        stroke="currentColor"
        strokeWidth={2}
        opacity={0.2}
        vectorEffect="non-scaling-stroke"
      />
      {runs.map((points, k) => (
        <polyline
          key={k}
          data-seg={k}
          points={points.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* A mark only lands on a settled point, so its dot is always on a
          drawn piece of the curve. */}
      {marks
        ?.filter((m) => point(m.index) !== null)
        .map((m) => (
          <circle
            key={m.index}
            data-mark={m.index}
            cx={fixed(x(m.index))}
            cy={fixed(y(point(m.index)!))}
            r={6}
            fill={CLASSIFICATIONS[m.grade].color}
          />
        ))}
      <line
        data-cursor=""
        x1={fixed(x(index))}
        x2={fixed(x(index))}
        y1={0}
        y2={HEIGHT}
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
