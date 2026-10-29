import { useRef, useState } from 'react';

import {
  BOARD_THEMES,
  pieceSrc,
  type BoardTheme,
  type PieceSet,
} from '@/app/store';
import { GradeSticker } from '@/components/review/grade-sticker';
import type { Classification } from '@/lib/analysis/classify';
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

// Written as inline longhands by the flight rather than through a stylesheet,
// because jsdom applies no cascade to getComputedStyle and rects are all zero
// there; inline longhands are what a jsdom test can actually assert.
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
  set = 'kiwen',
  className,
}: {
  type: string;
  white: boolean;
  set?: PieceSet;
  className?: string;
}) {
  const code = (white ? 'w' : 'b') + type.toUpperCase();
  return (
    <img
      alt=""
      aria-hidden
      draggable={false}
      data-piece={code}
      src={pieceSrc(set, code)}
      className={cn('block size-full select-none', className)}
    />
  );
}

type Cell = { square: string; piece: string | null };

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** "e4, white pawn", or just "e5" for an empty square. */
function squareLabel(square: string, piece: string | null) {
  if (!piece) return square;
  const color = piece === piece.toUpperCase() ? 'white' : 'black';
  return `${square}, ${color} ${PIECE_NAMES[piece.toLowerCase()]}`;
}

/**
 * Move input: the board names the square, the caller decides. Clicking reports
 * `onSquare`; dragging reports `onDragStart` once a piece is picked up and
 * `onDrop` when it lands. Without the drag callbacks the board only clicks.
 */
export type BoardPlay = {
  selected: string | null;
  targets: readonly string[];
  onSquare: (square: string) => void;
  /** A piece was picked up on `square`. False refuses the drag. */
  onDragStart?: (square: string) => boolean;
  /** The dragged piece was let go over `to`, or off the board (null). */
  onDrop?: (from: string, to: string | null) => void;
};

/** Pointer travel, in px, before a press on a piece becomes a drag. */
const DRAG_SLOP = 4;

/** The square under a point, given the board's rect, or null off the board. */
export function squareAt(
  rect: { left: number; top: number; width: number; height: number },
  flipped: boolean,
  x: number,
  y: number,
): string | null {
  if (!rect.width || !rect.height) return null;
  const col = Math.floor(((x - rect.left) / rect.width) * 8);
  const row = Math.floor(((y - rect.top) / rect.height) * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const file = flipped ? 7 - col : col;
  const rank = flipped ? row + 1 : 8 - row;
  return 'abcdefgh'[file]! + rank;
}

type Drag = { from: string; code: string; x: number; y: number; size: number };

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
  pieceSet = 'kiwen',
  coordinates,
  lastMove,
  checkOn,
  arrow,
  second,
  hint,
  moving,
  grade,
  play,
}: {
  fen: string;
  flipped: boolean;
  theme: BoardTheme;
  pieceSet?: PieceSet;
  coordinates: boolean;
  lastMove?: { from: string; to: string };
  /** Piece letter (K or k) of the king currently in check. */
  checkOn?: 'K' | 'k';
  /** A UCI move ("e2e4") to draw as an arrow, e.g. the engine's best move. */
  arrow?: string;
  /** A UCI move drawn fainter, under `arrow`: the engine's second choice. */
  second?: string;
  /** A square to ring, e.g. the piece a hint says to move. */
  hint?: string;
  /** The piece to slide, when the viewer arrived here by a single step. */
  moving?: MovingPiece | null;
  /** Grade of the ply that produced this position, stuck on `lastMove.to`. */
  grade?: Classification | null;
  /** Makes every square a button. Without it the board is a picture. */
  play?: BoardPlay;
}) {
  const colors = BOARD_THEMES[theme];
  const rows = cells(fen);
  const ordered = (flipped ? [...rows].reverse() : rows).map((row) =>
    flipped ? [...row].reverse() : row,
  );
  const flight = moving ? flightOffset(moving, flipped) : null;

  const gridRef = useRef<HTMLDivElement>(null);
  // A press on a piece, until it either becomes a drag or ends as a click.
  const press = useRef<{ from: string; x: number; y: number; id: number }>(
    null,
  );
  const dragging = useRef(false);
  const swallowClick = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);

  function onPointerMove(e: React.PointerEvent) {
    const p = press.current;
    const grid = gridRef.current;
    if (!play || !p || !grid || e.pointerId !== p.id) return;
    if (!dragging.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_SLOP) return;
      if (!play.onDragStart?.(p.from)) {
        press.current = null;
        return;
      }
      dragging.current = true;
      // Only now: capturing at pointerdown would retarget the click away from
      // the square, and break click-to-move.
      grid.setPointerCapture?.(e.pointerId);
    }
    const rect = grid.getBoundingClientRect();
    setDrag({
      from: p.from,
      code: pieceCode(fen, p.from) ?? 'wP',
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      size: rect.width / 8,
    });
  }

  function endPress(e: React.PointerEvent, cancelled: boolean) {
    const p = press.current;
    const grid = gridRef.current;
    press.current = null;
    if (!play || !p || !grid || !dragging.current) return;
    dragging.current = false;
    swallowClick.current = true;
    setDrag(null);
    const to = cancelled
      ? null
      : squareAt(grid.getBoundingClientRect(), flipped, e.clientX, e.clientY);
    play.onDrop?.(p.from, to);
  }

  return (
    // The frame is on this box, not the grid: the flight and arrow layers are
    // absolutely placed against its inside, so they stay aligned with the squares.
    <div className="border-line bg-line relative border-2">
      <style>{MOVE_CSS}</style>
      <div
        // An img's children are presentational, which would hide the buttons.
        ref={gridRef}
        role={play ? 'group' : 'img'}
        aria-label={`Chess board, ${flipped ? 'black' : 'white'} at the bottom`}
        className={cn(
          'grid aspect-square w-full grid-cols-[repeat(8,minmax(0,1fr))] grid-rows-[repeat(8,minmax(0,1fr))]',
          // A touch that starts on the board drags a piece, not the page.
          play?.onDragStart && 'touch-none select-none',
        )}
        style={{ containerType: 'inline-size' }}
        onPointerMove={play?.onDragStart ? onPointerMove : undefined}
        onPointerUp={play?.onDragStart ? (e) => endPress(e, false) : undefined}
        onPointerCancel={
          play?.onDragStart ? (e) => endPress(e, true) : undefined
        }
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
          const selected = play?.selected === square;
          const target = play?.targets.includes(square);
          const Square = play ? 'button' : 'div';
          const input = play && {
            type: 'button' as const,
            tabIndex: -1,
            'aria-label': squareLabel(square, piece),
            'aria-pressed': selected,
            onClick: () => {
              if (swallowClick.current) swallowClick.current = false;
              else play.onSquare(square);
            },
            onPointerDown: (e: React.PointerEvent) => {
              swallowClick.current = false;
              if (!piece || !play.onDragStart) return;
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              press.current = {
                from: square,
                x: e.clientX,
                y: e.clientY,
                id: e.pointerId,
              };
            },
          };
          return (
            <Square
              key={square}
              data-square={square}
              className={cn(
                'relative flex min-h-0 min-w-0 items-center justify-center',
                play && 'cursor-pointer',
              )}
              style={{ background: light ? colors.light : colors.dark }}
              {...input}
            >
              {(lastTouched || selected) && (
                <span
                  data-selected={selected || undefined}
                  className="bg-board-move absolute inset-0"
                />
              )}
              {square === hint && (
                <span
                  data-hint=""
                  className="pointer-events-none absolute inset-0 z-[11] border-[0.9cqw] border-(--board-arrow)"
                />
              )}
              {target && (
                <span
                  data-target=""
                  className={cn(
                    'pointer-events-none absolute z-[11] rounded-full',
                    piece
                      ? 'border-line/35 inset-[5%] border-[1.1cqw]'
                      : 'bg-line/30 size-[30%]',
                  )}
                />
              )}
              {inCheck && (
                <span className="absolute inset-0 bg-[radial-gradient(circle,rgba(239,68,68,0.9)_0%,rgba(239,68,68,0)_70%)]" />
              )}
              {piece && (
                <Piece
                  type={piece.toLowerCase()}
                  white={piece === piece.toUpperCase()}
                  set={pieceSet}
                  className={cn(
                    'relative z-10 size-[88%] drop-shadow-[1px_2px_0_rgb(0_0_0/0.3)]',
                    drag?.from === square && 'opacity-30',
                  )}
                />
              )}
              {coordinates && left && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-[0.5cqw] left-[0.6cqw] font-mono text-[2.4cqw] leading-none font-bold"
                  style={{ color: light ? colors.dark : colors.light }}
                >
                  {rank}
                </span>
              )}
              {coordinates && bottom && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[0.6cqw] bottom-[0.5cqw] font-mono text-[2.4cqw] leading-none font-bold"
                  style={{ color: light ? colors.dark : colors.light }}
                >
                  {square[0]}
                </span>
              )}
              {grade && square === lastMove?.to && (
                <GradeSticker
                  grade={grade}
                  iconOnly
                  className="pointer-events-none absolute -top-[1.2cqw] -right-[1.2cqw] z-30 scale-90"
                />
              )}
            </Square>
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
              set={pieceSet}
              className="size-[88%] drop-shadow-[1px_2px_0_rgb(0_0_0/0.3)]"
            />
          </div>
        </div>
      )}
      {play && drag && (
        <div
          data-drag-layer=""
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
        >
          <div
            data-dragging={drag.from}
            data-piece={drag.code}
            className="absolute flex items-center justify-center"
            style={{
              width: drag.size,
              height: drag.size,
              transform: `translate(${drag.x - drag.size / 2}px, ${drag.y - drag.size / 2}px)`,
            }}
          >
            <Piece
              type={drag.code[1]!.toLowerCase()}
              white={drag.code[0] === 'w'}
              set={pieceSet}
              className="size-[100%] drop-shadow-[2px_4px_0_rgb(0_0_0/0.3)]"
            />
          </div>
        </div>
      )}
      {second && <Arrow uci={second} flipped={flipped} faint />}
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

function Arrow({
  uci,
  flipped,
  faint = false,
}: {
  uci: string;
  flipped: boolean;
  faint?: boolean;
}) {
  const from = center(uci.slice(0, 2), flipped);
  const to = center(uci.slice(2, 4), flipped);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const n = { x: -u.y, y: u.x };
  // A block arrow: a shaft, then a head whose tip stops short of the target's
  // centre so the piece underneath stays readable.
  const tail = { x: from.x + u.x * 0.2, y: from.y + u.y * 0.2 };
  const tip = { x: to.x - u.x * 0.12, y: to.y - u.y * 0.12 };
  const neck = { x: tip.x - u.x * 0.4, y: tip.y - u.y * 0.4 };
  const at = (p: { x: number; y: number }, w: number) =>
    `${(p.x + n.x * w).toFixed(3)},${(p.y + n.y * w).toFixed(3)}`;
  const points = [
    at(tail, 0.1),
    at(neck, 0.1),
    at(neck, 0.26),
    `${tip.x.toFixed(3)},${tip.y.toFixed(3)}`,
    at(neck, -0.26),
    at(neck, -0.1),
    at(tail, -0.1),
  ].join(' ');
  return (
    <svg
      viewBox="0 0 8 8"
      aria-hidden
      data-arrow={uci}
      opacity={faint ? 0.4 : undefined}
      className="pointer-events-none absolute inset-0 z-20 size-full"
    >
      <polygon
        points={points}
        fill="var(--board-arrow)"
        stroke="var(--line)"
        strokeWidth="0.05"
        strokeLinejoin="round"
      />
    </svg>
  );
}
