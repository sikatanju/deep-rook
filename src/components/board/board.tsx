import { BOARD_THEMES, type BoardTheme } from '@/app/store';
import { fenAt, type Replay } from '@/lib/chess/replay';
import { cn } from '@/lib/utils';

/** A piece flying between two squares, as derived from the ply being stepped. */
export type MovingPiece = {
  /** Square the piece is leaving, in chess terms. */
  from: string;
  /** Square it lands on. */
  to: string;
  /** FEN piece code, read from the position the piece starts in. */
  code: string;
  /** The ply number: changes exactly when a new flight must start. */
  key: number;
};

/** A move grade, as CLASSIFICATIONS holds it. */
type Grade = { label: string; symbol: string; color: string };

// Written as inline longhands by the flight and the badge rather than through a
// stylesheet, because jsdom applies no cascade to getComputedStyle and rects are
// all zero there; inline longhands are what a jsdom test can actually assert.
/** How long a piece takes to travel between two squares. */
export const MOVE_MS = '220ms';

// One keyframe, and a positive one: `--mx`/`--my` already carry the direction,
// because `movingPiece` reports the square the piece stands on as `from` and the
// square it lands on as `to` for a take-back too. Negating the delta here, or
// adding `animation-direction: reverse`, would flip a step that is already
// flipped — which is exactly the bug that drew backward steps onto the wrong
// square (measured: a take-back f3->g1 slid from e5 back to f3).
const MOVE_CSS = `
@keyframes piece-move {
  from { transform: translate(0, 0); }
  to { transform: translate(calc(var(--mx) * 100%), calc(var(--my) * 100%)); }
}`;

/**
 * Where the flight box sits and how far it travels, in board fractions of 0..8:
 * `left`/`top` name the cell the piece is leaving, `mx`/`my` are whole squares.
 */
export function flightOffset(moving: MovingPiece, flipped: boolean) {
  const point = (square: string) => {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    return flipped ? { x: 7 - file, y: rank } : { x: file, y: 7 - rank };
  };
  const from = point(moving.from);
  const to = point(moving.to);
  // The box is one square wide and translates by whole squares, so it is placed
  // on the cell it starts in — `left`/`top` of the cell, not of its centre.
  return {
    left: `${(from.x / 8) * 100}%`,
    top: `${(from.y / 8) * 100}%`,
    mx: to.x - from.x,
    my: to.y - from.y,
  };
}

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

export function cells(fen: string): Cell[][] {
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

/** The FEN's piece code on a square, e.g. "wP". Colour is the letter's case. */
function pieceCode(fen: string, square: string): string | null {
  const file = square.charCodeAt(0) - 97;
  const row = fen.split(' ')[0]!.split('/')[8 - Number(square[1])]!;
  let x = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      x += Number(ch);
      continue;
    }
    if (x === file)
      return (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
    x++;
  }
  return null;
}

/**
 * The piece a single step of the review flies between positions `from` and `to`,
 * or null when the board must snap. A step forward flies the ply at `to` from
 * its from-square; a step back unplays the ply at `from`, so the piece travels
 * from its to-square back home. Anything else — a move-list jump, Home/End, the
 * start position, a re-render that left the index alone — returns null, because
 * sliding a piece along a path it never played would be a lie.
 */
export function movingPiece(
  replay: Replay,
  to: number,
  from: number,
): MovingPiece | null {
  const step = to - from;
  if (step !== 1 && step !== -1) return null;
  const forward = step === 1;
  // Index N is the position after ply N. Stepping forward to index N plays ply N;
  // stepping back from index M unplays ply M. At index 0 there is no ply at
  // `to - 1`, yet ply 1 is exactly the one that must fly home.
  const ply = replay.plies[forward ? to - 1 : from - 1];
  if (!ply) return null;
  const [a, b] = forward ? [ply.from, ply.to] : [ply.to, ply.from];
  const fen = forward ? fenAt(replay, to - 1) : ply.fen;
  const code = pieceCode(fen, a);
  return code ? { from: a, to: b, code, key: to } : null;
}

export function Board({
  fen,
  flipped,
  theme,
  coordinates,
  lastMove,
  checkOn,
  arrow,
  moving,
  grade,
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
  /** The piece to slide, when the viewer arrived here by a single step. */
  moving?: MovingPiece | null;
  /** Grade of the ply that produced this position, drawn on `moving.to`. */
  grade?: Grade | null;
}) {
  const colors = BOARD_THEMES[theme];
  const rows = cells(fen);
  const ordered = (flipped ? [...rows].reverse() : rows).map((row) =>
    flipped ? [...row].reverse() : row,
  );
  const flight = moving ? flightOffset(moving, flipped) : null;
  return (
    <div className="relative">
      <style>{MOVE_CSS}</style>
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
              {grade && square === moving?.to && (
                <span
                  key={`${moving.key}-${grade.label}`}
                  role="img"
                  aria-label={grade.label}
                  title={grade.label}
                  data-grade={grade.label.toLowerCase()}
                  className="pointer-events-none absolute top-[0.8cqw] right-[0.8cqw] z-30 grid aspect-square w-[6cqw] place-items-center rounded-full font-sans leading-none font-bold text-white"
                  style={{
                    background: grade.color,
                    fontSize: '3.4cqw',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                  }}
                >
                  {grade.symbol}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {flight && moving && (
        // Never a child of the grid: an in-flow extra grid item creates a ninth
        // implicit row and grows the board (measured: 616px -> 632px).
        <div
          data-move-layer=""
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[15]"
        >
          <div
            key={moving.key}
            data-moving={`${moving.from}${moving.to}`}
            data-piece={moving.code}
            className="absolute flex items-center justify-center"
            style={{
              width: '12.5%',
              height: '12.5%',
              left: flight.left,
              top: flight.top,
              ['--mx' as string]: flight.mx,
              ['--my' as string]: flight.my,
              animationName: 'piece-move',
              animationDuration: MOVE_MS,
              animationTimingFunction: 'ease-out',
              animationFillMode: 'both',
            }}
          >
            <Piece
              type={moving.code[1]!.toLowerCase()}
              white={moving.code[0] === 'w'}
              className="size-[88%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
            />
          </div>
        </div>
      )}
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
