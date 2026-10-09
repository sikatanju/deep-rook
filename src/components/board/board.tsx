import { BOARD_THEMES, type BoardTheme } from '@/app/store';
import { cn } from '@/lib/utils';

export function Piece({
  type,
  white,
  className,
}: {
  type: string;
  white: boolean;
  className?: string;
}) {
  const code = (white ? 'w' : 'b') + type.toUpperCase();
  return (
    <img
      alt=""
      aria-hidden
      draggable={false}
      data-piece={code}
      src={`/pieces/${code}.svg`}
      className={cn('block size-full select-none', className)}
    />
  );
}

type Cell = { square: string; piece: string | null };

function cells(fen: string): Cell[][] {
  return fen
    .split(' ')[0]!
    .split('/')
    .map((row, r) => {
      const out: Cell[] = [];
      for (const ch of row) {
        const gap = Number(ch);
        if (gap) {
          for (let i = 0; i < gap; i++) {
            out.push({
              square: 'abcdefgh'[out.length]! + (8 - r),
              piece: null,
            });
          }
        } else {
          out.push({ square: 'abcdefgh'[out.length]! + (8 - r), piece: ch });
        }
      }
      return out;
    });
}

export function Board({
  fen,
  flipped,
  theme,
  coordinates,
  lastMove,
  checkOn,
  arrow,
}: {
  fen: string;
  flipped: boolean;
  theme: BoardTheme;
  coordinates: boolean;
  lastMove?: { from: string; to: string };
  /** Piece letter (K or k) of the king currently in check. */
  checkOn?: 'K' | 'k';
  /** A UCI move ("e2e4") to draw as an arrow, e.g. the engine's best move. */
  arrow?: string;
}) {
  const colors = BOARD_THEMES[theme];
  const rows = cells(fen);
  const ordered = (flipped ? [...rows].reverse() : rows).map((row) =>
    flipped ? [...row].reverse() : row,
  );
  return (
    <div className="relative">
      <div
        role="img"
        aria-label={`Chess board, ${flipped ? 'black' : 'white'} at the bottom`}
        className="grid aspect-square w-full grid-cols-[repeat(8,minmax(0,1fr))] grid-rows-[repeat(8,minmax(0,1fr))] overflow-hidden rounded-md shadow-md"
        style={{ containerType: 'inline-size' }}
      >
        {ordered.flat().map(({ square, piece }, i) => {
          const file = square.charCodeAt(0) - 97;
          const rank = Number(square[1]);
          const light = (file + rank) % 2 === 0;
          const lastTouched =
            square === lastMove?.from || square === lastMove?.to;
          const inCheck = piece !== null && piece === checkOn;
          const bottom = i >= 56;
          const left = i % 8 === 0;
          return (
            <div
              key={square}
              data-square={square}
              className="relative flex min-h-0 min-w-0 items-center justify-center"
              style={{ background: light ? colors.light : colors.dark }}
            >
              {lastTouched && (
                <span className="absolute inset-0 bg-yellow-300/50" />
              )}
              {inCheck && (
                <span className="absolute inset-0 bg-[radial-gradient(circle,rgba(239,68,68,0.9)_0%,rgba(239,68,68,0)_70%)]" />
              )}
              {piece && (
                <Piece
                  type={piece.toLowerCase()}
                  white={piece === piece.toUpperCase()}
                  className="relative z-10 size-[88%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                />
              )}
              {coordinates && left && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-[0.5cqw] left-[0.6cqw] text-[2.4cqw] leading-none font-semibold"
                  style={{ color: light ? colors.dark : colors.light }}
                >
                  {rank}
                </span>
              )}
              {coordinates && bottom && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[0.6cqw] bottom-[0.5cqw] text-[2.4cqw] leading-none font-semibold"
                  style={{ color: light ? colors.dark : colors.light }}
                >
                  {square[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {arrow && <Arrow uci={arrow} flipped={flipped} />}
    </div>
  );
}

/** Square center in a 0..8 viewBox, with rank 8 at the top unless flipped. */
function center(square: string, flipped: boolean) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return flipped
    ? { x: 7 - file + 0.5, y: rank + 0.5 }
    : { x: file + 0.5, y: 7 - rank + 0.5 };
}

function Arrow({ uci, flipped }: { uci: string; flipped: boolean }) {
  const from = center(uci.slice(0, 2), flipped);
  const to = center(uci.slice(2, 4), flipped);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  // Stop short of the target center so the head sits on the square.
  const end = {
    x: to.x - ((to.x - from.x) / len) * 0.3,
    y: to.y - ((to.y - from.y) / len) * 0.3,
  };
  return (
    <svg
      viewBox="0 0 8 8"
      aria-hidden
      data-arrow={uci}
      className="pointer-events-none absolute inset-0 z-20 size-full"
    >
      <defs>
        <marker
          id="best-move-head"
          viewBox="0 0 4 4"
          refX="1.2"
          refY="2"
          markerWidth="3"
          markerHeight="3"
          orient="auto"
        >
          <path d="M0 0L4 2L0 4z" fill="rgba(21,128,61,0.85)" />
        </marker>
      </defs>
      <line
        x1={from.x}
        y1={from.y}
        x2={end.x}
        y2={end.y}
        stroke="rgba(21,128,61,0.85)"
        strokeWidth="0.16"
        strokeLinecap="round"
        markerEnd="url(#best-move-head)"
      />
    </svg>
  );
}
