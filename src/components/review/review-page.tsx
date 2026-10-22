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

import { navigate } from '@/app/router';
import { useStore, type Loaded } from '@/app/store';
import { Board, movingPiece } from '@/components/board/board';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useGameAnalysis } from '@/hooks/use-game-analysis';
import { classifyMoves, type Classification } from '@/lib/analysis/classify';
import { ANALYSIS_LEVELS } from '@/lib/analysis/levels';
import { evalSeries, gameReport } from '@/lib/analysis/report';
import {
  fenAt,
  materialOf,
  sanLine,
  type Ply,
  type Replay,
} from '@/lib/chess/replay';
import { formatScore, type Variation } from '@/lib/chess/score';

import { CoachBubble } from './coach-bubble';
import { CopyLink } from './copy-link';
import { EvalBar } from './eval-bar';
import { EvalGraph } from './eval-graph';
import { ExportPgn } from './export-pgn';
import { MoveList } from './move-list';
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

/** The coach's one-liner per grade: cheeky, never mean, under 45 characters. */
const COACH_LINE: Record<Classification, string> = {
  brilliant: 'Brilliant! The board just gasped.',
  great: 'Great find. That one really mattered.',
  best: 'Engine-approved. Nothing to add.',
  excellent: 'Basically perfect.',
  good: 'Solid. There was a sharper try.',
  inaccuracy: 'Wobbly. Not fatal, just loose.',
  miss: 'A tactic was sitting right there.',
  mistake: 'That hands over the initiative.',
  blunder: 'Oof. That hangs the game.',
};

/** "16. Qb8+" for White's move, "16… Nxb8" for Black's. */
const moveLabel = (ply: Ply) =>
  `${ply.moveNumber}${ply.color === 'w' ? '.' : '…'} ${ply.san}`;

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
  const line = here && here.status !== 'failed' ? here.line : null;
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

  const { headers, plies } = replay;
  const ply = index > 0 ? plies[index - 1] : undefined;
  /** A graded move's alternative from the engine line before it, unless it is the move played. */
  const instead = (variation: Variation | undefined) => {
    if (!grade || !ply || !variation) return undefined;
    const san = sanLine(fenAt(replay, index - 1), variation.pv.slice(0, 1))[0];
    return san && san !== ply.san
      ? { san, eval: formatScore(variation.score) }
      : undefined;
  };
  const before = prior?.status === 'done' ? prior.line : undefined;
  const fen = fenAt(replay, index);
  const material = materialOf(fen);
  const sideToMove = fen.split(' ')[1] as 'w' | 'b';
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

  const eval_ = line ? formatScore(line.score) : undefined;
  const coach = (() => {
    if (index === 0)
      return {
        title: 'Ready when you are.',
        body: 'Step through with the arrow keys or click the graph.',
      };
    if (!grade || !ply)
      return {
        title: 'Still thinking about this one.',
        body: 'The coach speaks up once the engine has settled this move.',
      };
    const sentences = [];
    if (prior?.status === 'done' && here?.status === 'done')
      sentences.push(
        `The eval went from ${formatScore(prior.line.score)} to ${formatScore(here.line.score)}.`,
      );
    const result = headers.Termination ?? headers.Result;
    if (atEnd && result) sentences.push(`${result}.`);
    return { title: COACH_LINE[grade], body: sentences.join(' ') };
  })();

  const labels = useMemo(
    () => [
      'Start',
      ...replay.plies.map((p, i) => {
        const at = analysis?.positions[i + 1];
        return at?.status === 'done'
          ? `${moveLabel(p)}  ${formatScore(at.line.score)}`
          : moveLabel(p);
      }),
    ],
    [replay, analysis],
  );

  const stepButton = (
    label: string,
    icon: React.ReactNode,
    to: number,
    disabled: boolean,
  ) => (
    <Button size="icon-sm" onClick={() => go(to)} disabled={disabled}>
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );

  return (
    <>
      <div className="grid gap-x-5 gap-y-5 xl:mx-auto xl:w-full xl:max-w-[calc(max(22rem,100svh-6rem)+25.25rem)] xl:grid-cols-[minmax(0,1fr)_24rem] xl:grid-rows-[auto_minmax(0,1fr)_auto] xl:items-start 2xl:max-w-[calc(max(22rem,100svh-6rem)+29.25rem)] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
        <h1 className="sr-only">{loaded.source}</h1>
        <div
          ref={column}
          // The board is the page: as wide as the space allows, but short enough
          // that its strips stay on screen, with the step buttons too until they move
          // beside it at xl. 2.5rem of the width is the eval bar and its gap; the
          // rem figure is everything else stacked above and below the board.
          className="grid w-[min(100%,max(22rem,calc(100svh-11.5rem)))] grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 justify-self-center xl:col-start-1 xl:row-span-3 xl:row-start-1 xl:w-[min(100%,max(22rem,calc(100svh-6rem)))] xl:justify-self-start"
          style={size === null ? undefined : { width: size }}
        >
          <div className="col-start-2">{strip(top)}</div>
          <EvalBar score={line?.score ?? null} flipped={flipped} />
          <div className="relative">
            <Board
              fen={fen}
              flipped={flipped}
              theme={settings.boardTheme}
              coordinates={settings.coordinates}
              lastMove={ply}
              checkOn={
                ply?.check ? (sideToMove === 'w' ? 'K' : 'k') : undefined
              }
              arrow={line?.pv[0]}
              second={line?.second?.pv[0]}
              moving={moving}
              grade={grade ?? null}
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Board size"
              aria-valuemin={MIN_SIZE}
              aria-valuemax={MAX_SIZE}
              aria-valuenow={Math.round(size ?? MIN_SIZE)}
              title="Drag to resize, double-click to reset"
              className="border-line bg-accent absolute -right-3 -bottom-3 z-20 size-6 cursor-nwse-resize touch-none rounded-sm border-3 shadow-sm"
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
                  clampSize(
                    (column.current?.offsetWidth ?? MIN_SIZE) + dir * 24,
                  ),
                );
              }}
            />
          </div>
          <div className="col-start-2">{strip(bottom)}</div>
        </div>

        <div className="ml-10 flex flex-wrap items-center justify-center gap-2 justify-self-center xl:col-start-2 xl:row-start-3 xl:-mt-5 xl:ml-0 xl:h-13 xl:justify-self-stretch">
          {stepButton(
            'First move',
            <ChevronsLeftIcon aria-hidden />,
            0,
            index === 0,
          )}
          {stepButton(
            'Previous move',
            <ChevronLeftIcon aria-hidden />,
            index - 1,
            index === 0,
          )}
          <Button
            variant="primary"
            size="sm"
            aria-pressed={running}
            onClick={() => {
              if (atEnd) goTo(0);
              setPlaying(atEnd || !playing);
            }}
          >
            {running ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
            {running ? 'Pause' : 'Autoplay'}
          </Button>
          {stepButton(
            'Next move',
            <ChevronRightIcon aria-hidden />,
            index + 1,
            atEnd,
          )}
          {stepButton(
            'Last move',
            <ChevronsRightIcon aria-hidden />,
            last,
            atEnd,
          )}
          <Button
            size="icon-sm"
            aria-label="Flip board"
            title="Flip board (F)"
            onClick={() => setFlipped((f) => !f)}
          >
            <RotateCwIcon aria-hidden />
          </Button>
          <CopyLink replay={replay} side={flipped ? 'b' : 'w'} />
          <ExportPgn replay={replay} analysis={analysis} />
        </div>
        <div className="w-full max-w-2xl min-w-0 justify-self-center xl:col-start-2 xl:row-start-1 xl:mt-13 xl:max-w-none">
          <CoachBubble
            grade={grade ?? undefined}
            move={ply && grade ? moveLabel(ply) : undefined}
            eval={grade ? eval_ : undefined}
            best={instead(before)}
            next={instead(before?.second)}
            title={coach.title}
          >
            {coach.body}
          </CoachBubble>
        </div>
        <section
          aria-label="Moves"
          // At xl the sheet takes whatever height the board leaves beside it: its
          // list is absolute, so it adds none of its own and the step buttons
          // end level with the board's bottom edge.
          className="border-line bg-surface relative flex h-72 w-full max-w-2xl min-w-0 flex-col justify-self-center overflow-hidden rounded-md border-3 shadow-md xl:col-start-2 xl:row-start-2 xl:h-auto xl:max-w-none xl:self-stretch"
        >
          <div className="min-h-0 flex-1 overflow-y-auto xl:absolute xl:inset-0">
            <MoveList
              plies={plies}
              grades={grades}
              index={index}
              onSelect={(i) => goTo(i)}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <Panel
          tag="Eval"
          title="How it went"
          subtitle="Click anywhere on the graph to jump to that move."
        >
          {series.length > 1 && (
            <EvalGraph
              series={series}
              index={index}
              marks={report?.keyMoments.map((m) => ({
                index: m.index,
                grade: m.grade,
              }))}
              labels={labels}
              // `go`, not `goTo`: a drag is user navigation and must stop
              // autoplay, or the two fight over the index.
              onScrub={go}
            />
          )}
        </Panel>
        <ReportCard
          report={report}
          onJump={go}
          level={ANALYSIS_LEVELS[loaded.level].label}
          white={{
            name: headers.White,
            rating: headers.WhiteElo,
          }}
          black={{
            name: headers.Black,
            rating: headers.BlackElo,
          }}
        />
      </div>
    </>
  );
}

export function ReviewPage() {
  const { loaded } = useStore();
  if (!loaded) {
    return (
      <>
        <PageHeader eyebrow="Nothing here yet">
          Review a <Highlight>game</Highlight>
        </PageHeader>
        <Panel
          title="No game loaded."
          subtitle="Pick a game, choose a review mode, and press Review game."
          className="max-w-xl"
        >
          <div>
            <Button variant="primary" onClick={() => navigate('games')}>
              Choose a game
            </Button>
          </div>
        </Panel>
      </>
    );
  }
  return <Viewer key={loaded.id} loaded={loaded} />;
}
