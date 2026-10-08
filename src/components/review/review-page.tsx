import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { navigate } from '@/app/router';
import { useStore, type Loaded } from '@/app/store';
import { Board } from '@/components/board/board';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  fenAt,
  materialOf,
  openingName,
  type Replay,
} from '@/lib/chess/replay';

import { MoveList } from './move-list';
import { PlayerStrip } from './player-strip';

function clockAt(replay: Replay, index: number, color: 'w' | 'b') {
  const parity = color === 'w' ? 0 : 1;
  for (let i = index; i >= 1; i--) {
    if ((i - 1) % 2 === parity) return replay.plies[i - 1]!.clock;
  }
  const base = Number(replay.headers.TimeControl?.split('+')[0]);
  return Number.isFinite(base) && base > 0 ? base : undefined;
}

const MIN_SIZE = 280;
const MAX_SIZE = 2200;
const clampSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function Viewer({ loaded }: { loaded: Loaded }) {
  const { replay, orientation } = loaded;
  const { settings } = useStore();
  const last = replay.plies.length;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(orientation === 'b');
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const column = useRef<HTMLDivElement>(null);
  const resize = useRef<{ x: number; y: number; w: number } | null>(null);

  const go = useCallback(
    (to: number) => setIndex(Math.min(last, Math.max(0, to))),
    [last],
  );

  const step = (to: number) => {
    setPlaying(false);
    go(to);
  };

  const running = playing && index < last;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setIndex((i) => i + 1), settings.autoplayMs);
    return () => clearTimeout(t);
  }, [running, index, settings.autoplayMs]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (index >= last) go(0);
        setPlaying(index >= last || !running);
        return;
      }
      const keys: Record<string, () => void> = {
        ArrowLeft: () => go(index - 1),
        ArrowRight: () => go(index + 1),
        ArrowUp: () => go(0),
        ArrowDown: () => go(last),
        Home: () => go(0),
        End: () => go(last),
        f: () => setFlipped((f) => !f),
      };
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      if (e.key !== 'f') setPlaying(false);
      action();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, last, running]);

  const { headers, plies } = replay;
  const ply = index > 0 ? plies[index - 1] : undefined;
  const fen = fenAt(replay, index);
  const material = materialOf(fen);
  const sideToMove = fen.split(' ')[1] as 'w' | 'b';
  const opening = openingName(headers);
  const atEnd = index === last;

  const strip = (color: 'w' | 'b') => (
    <PlayerStrip
      color={color}
      name={headers[color === 'w' ? 'White' : 'Black'] ?? 'Unknown'}
      rating={headers[color === 'w' ? 'WhiteElo' : 'BlackElo']}
      captured={color === 'w' ? material.lost.b : material.lost.w}
      lead={Math.max(0, color === 'w' ? material.balance : -material.balance)}
      clock={clockAt(replay, index, color)}
      toMove={sideToMove === color && !atEnd}
    />
  );
  const [top, bottom] = flipped ? (['w', 'b'] as const) : (['b', 'w'] as const);

  return (
    <div
      className={cn(
        'grid items-start gap-6',
        size === null
          ? 'lg:grid-cols-[minmax(0,1fr)_20rem]'
          : 'lg:grid-cols-[auto_20rem]',
      )}
    >
      <div
        ref={column}
        className={cn(
          'mx-auto w-full',
          size === null &&
            'max-w-[min(100%,calc(100svh-8rem))] [@media(min-width:1280px)_and_(min-height:720px)]:min-w-[min(100%,36rem)]',
        )}
        style={size === null ? undefined : { width: size }}
      >
        {strip(top)}
        <div className="relative">
          <Board
            fen={fen}
            flipped={flipped}
            theme={settings.boardTheme}
            coordinates={settings.coordinates}
            lastMove={ply}
            checkOn={ply?.check ? (sideToMove === 'w' ? 'K' : 'k') : undefined}
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Board size"
            aria-valuemin={MIN_SIZE}
            aria-valuemax={MAX_SIZE}
            aria-valuenow={Math.round(size ?? MIN_SIZE)}
            title="Drag to resize, double-click to reset"
            className="bg-background/90 after:bg-foreground/50 absolute -right-2 -bottom-2 z-20 size-6 cursor-nwse-resize touch-none rounded-full border shadow after:absolute after:inset-1.5 after:rounded-full"
            onDoubleClick={() => setSize(null)}
            onPointerDown={(e) => {
              const el = column.current;
              if (!el) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              resize.current = {
                x: e.clientX,
                y: e.clientY,
                w: el.offsetWidth,
              };
            }}
            onPointerMove={(e) => {
              const r = resize.current;
              if (!r) return;
              const delta = (e.clientX - r.x + (e.clientY - r.y)) / 2;
              setSize(clampSize(r.w + delta));
            }}
            onPointerUp={() => (resize.current = null)}
            onKeyDown={(e) => {
              const dir = {
                ArrowRight: 1,
                ArrowUp: 1,
                ArrowLeft: -1,
                ArrowDown: -1,
              }[e.key];
              if (!dir) return;
              e.preventDefault();
              e.stopPropagation();
              setSize(
                clampSize((column.current?.offsetWidth ?? MIN_SIZE) + dir * 24),
              );
            }}
          />
        </div>
        {strip(bottom)}
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="font-medium">{loaded.source}</p>
            <p className="text-sm opacity-70">
              {[opening, headers.TimeControl && `${headers.TimeControl}s`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="h-64 overflow-y-auto rounded-md border p-1 lg:h-80">
            <MoveList plies={plies} index={index} onSelect={(i) => go(i)} />
          </div>
          {atEnd && (
            <p className="text-sm font-medium">
              {headers.Termination ?? headers.Result ?? ''}
            </p>
          )}
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => step(0)}
              disabled={index === 0}
            >
              <ChevronsLeftIcon aria-hidden />
              <span className="sr-only">First move</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => step(index - 1)}
              disabled={index === 0}
            >
              <ChevronLeftIcon aria-hidden />
              <span className="sr-only">Previous move</span>
            </Button>
            <Button
              size="icon"
              aria-pressed={running}
              onClick={() => {
                if (atEnd) go(0);
                setPlaying(atEnd || !playing);
              }}
            >
              {running ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
              <span className="sr-only">{running ? 'Pause' : 'Play'}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => step(index + 1)}
              disabled={atEnd}
            >
              <ChevronRightIcon aria-hidden />
              <span className="sr-only">Next move</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => step(last)}
              disabled={atEnd}
            >
              <ChevronsRightIcon aria-hidden />
              <span className="sr-only">Last move</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFlipped((f) => !f)}
            >
              <RotateCwIcon aria-hidden />
              <span className="sr-only">Flip board</span>
            </Button>
          </div>
          <p className="text-center text-xs opacity-60">
            Arrow keys step, space plays, F flips.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function ReviewPage() {
  const { loaded } = useStore();
  if (!loaded) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="font-medium">No game loaded.</p>
          <p className="text-sm opacity-70">
            Pick a game from Chess.com or paste a PGN, then it shows up here.
          </p>
          <Button onClick={() => navigate('games')}>Choose a game</Button>
        </CardContent>
      </Card>
    );
  }
  return <Viewer key={loaded.id} loaded={loaded} />;
}
