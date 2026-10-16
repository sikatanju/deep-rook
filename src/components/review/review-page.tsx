import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { navigate } from '@/app/router';
import { useStore, type Loaded } from '@/app/store';
import { Board, movingPiece } from '@/components/board/board';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useGameAnalysis } from '@/hooks/use-game-analysis';
import { CLASSIFICATIONS, classifyMoves } from '@/lib/analysis/classify';
import { ANALYSIS_LEVELS, LEVELS } from '@/lib/analysis/levels';
import { evalSeries, gameReport } from '@/lib/analysis/report';
import {
  fenAt,
  materialOf,
  openingName,
  sanLine,
  type Replay,
} from '@/lib/chess/replay';

import { EnginePanel } from './engine-panel';
import { EvalGraph } from './eval-graph';
import { GradeBadge, MoveList } from './move-list';
import { PlayerStrip } from './player-strip';
import { ReportCard } from './report-card';

function clockAt(replay: Replay, index: number, color: 'w' | 'b') {
  for (let i = index; i >= 1; i--) {
    const ply = replay.plies[i - 1]!;
    if (ply.color === color) return ply.clock;
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
  const { settings, setSettings } = useStore();
  const last = replay.plies.length;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(orientation === 'b');
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const column = useRef<HTMLDivElement>(null);
  const resize = useRef<{ x: number; y: number; w: number } | null>(null);
  // The position the viewer is coming from, held in the same state as the index
  // so a step is one atomic update: a later re-render (the engine streams in
  // constantly) must not be able to recompute the flight away.
  const [nav, setNav] = useState({ at: 0, from: 0 });

  const goTo = useCallback(
    (to: number) =>
      setNav((prev) => {
        const next = Math.min(last, Math.max(0, to));
        if (next === prev.at) return prev;
        setIndex(next);
        return { at: next, from: prev.at };
      }),
    [last],
  );

  const go = useCallback(
    (to: number) => {
      setPlaying(false);
      goTo(to);
    },
    [goTo],
  );

  const running = playing && index < last;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => goTo(index + 1), settings.autoplayMs);
    return () => clearTimeout(t);
  }, [running, index, settings.autoplayMs, goTo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (index >= last) goTo(0);
        setPlaying(index >= last || !running);
        return;
      }
      const keys: Record<string, () => void> = {
        ArrowLeft: () => goTo(index - 1),
        ArrowRight: () => goTo(index + 1),
        ArrowUp: () => goTo(0),
        ArrowDown: () => goTo(last),
        Home: () => goTo(0),
        End: () => goTo(last),
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
  }, [goTo, index, last, running]);

  const analysis = useGameAnalysis(loaded, index);
  const here = analysis?.positions[index];
  const best = here && here.status !== 'failed' ? here.line?.pv[0] : undefined;
  const grades = useMemo(
    () => (analysis ? classifyMoves(replay, analysis.positions) : []),
    [replay, analysis],
  );
  // The graph's series and the report derive from the same snapshot as the
  // grades, so all three stay mutually consistent while the engine streams.
  const series = useMemo(
    () => (analysis ? evalSeries(analysis.positions) : []),
    [analysis],
  );
  const report = useMemo(
    () => (analysis ? gameReport(replay, analysis.positions, grades) : null),
    [replay, analysis, grades],
  );
  const grade = grades[index - 1];
  const moving = movingPiece(replay, nav.at, nav.from);
  const prior = analysis?.positions[index - 1];
  const better =
    grade && grade !== 'best' && grade !== 'great' && prior?.status === 'done'
      ? sanLine(fenAt(replay, index - 1), prior.line.pv.slice(0, 1))[0]
      : undefined;

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
            arrow={best}
            moving={moving}
            grade={grade ? CLASSIFICATIONS[grade] : null}
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
        {series.length > 1 && (
          <EvalGraph
            series={series}
            index={index}
            marks={report?.keyMoments.map((m) => ({
              index: m.index,
              grade: m.grade,
            }))}
            // `go`, not `goTo`: a drag is user navigation and must stop
            // autoplay, or the two fight over the index.
            onScrub={go}
          />
        )}
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
          <fieldset className="flex gap-1 rounded-md border p-1">
            <legend className="sr-only">Analysis depth</legend>
            {LEVELS.map((level) => (
              <label
                key={level}
                title={ANALYSIS_LEVELS[level].blurb}
                className={cn(
                  'has-[:focus-visible]:ring-ring flex-1 cursor-pointer rounded px-2 py-1 text-center text-sm has-[:focus-visible]:ring-2',
                  settings.analysisLevel === level
                    ? 'bg-accent font-medium'
                    : 'opacity-70',
                )}
              >
                <input
                  type="radio"
                  name="review-analysis-level"
                  className="sr-only"
                  checked={settings.analysisLevel === level}
                  onChange={() => setSettings({ analysisLevel: level })}
                />
                {ANALYSIS_LEVELS[level].label}
              </label>
            ))}
          </fieldset>
          <EnginePanel analysis={analysis} index={index} fen={fen} />
          <ReportCard report={report} onJump={go} />
          {grade && ply && (
            <p className="flex items-center gap-2 text-sm">
              <GradeBadge grade={grade} />
              <span>
                <span className="font-medium">{ply.san}</span> is{' '}
                {CLASSIFICATIONS[grade].label.toLowerCase()}
                {better && better !== ply.san && (
                  <span className="opacity-70"> · best was {better}</span>
                )}
              </span>
            </p>
          )}
          <div className="h-64 overflow-y-auto rounded-md border p-1 lg:h-80">
            <MoveList
              plies={plies}
              grades={grades}
              index={index}
              onSelect={(i) => goTo(i)}
            />
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
              onClick={() => go(0)}
              disabled={index === 0}
            >
              <ChevronsLeftIcon aria-hidden />
              <span className="sr-only">First move</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              <ChevronLeftIcon aria-hidden />
              <span className="sr-only">Previous move</span>
            </Button>
            <Button
              size="icon"
              aria-pressed={running}
              onClick={() => {
                if (atEnd) goTo(0);
                setPlaying(atEnd || !playing);
              }}
            >
              {running ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
              <span className="sr-only">{running ? 'Pause' : 'Play'}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => go(index + 1)}
              disabled={atEnd}
            >
              <ChevronRightIcon aria-hidden />
              <span className="sr-only">Next move</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => go(last)}
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
