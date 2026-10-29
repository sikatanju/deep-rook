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
import { PromotionPicker } from '@/components/board/promotion-picker';
import { TypedMove } from '@/components/board/typed-move';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { readSavedUsernames } from '@/components/game-picker/username-form';
import { useGameAnalysis, useProbe } from '@/hooks/use-game-analysis';
import { useMoveInput } from '@/hooks/use-move-input';
import { useSavedReviews } from '@/hooks/use-saved-reviews';
import { useSound } from '@/hooks/use-sound';
import {
  classifyMoves,
  gradeSideMove,
  type Classification,
} from '@/lib/analysis/classify';
import { explainMove } from '@/lib/analysis/explain';
import { searchInputAt } from '@/lib/analysis/inputs';
import { badgeLabel } from '@/lib/analysis/levels';
import { sideOf } from '@/lib/analysis/overview';
import { evalSeries, gameReport, MOMENT_GRADES } from '@/lib/analysis/report';
import {
  branchFen,
  branchFens,
  isGameMove,
  playedPlies,
  playLine,
  playMove,
  stepTo,
  type Branch,
} from '@/lib/chess/branch';
import { clockShowing, formatSpent, moveClocks } from '@/lib/chess/clock';
import type { Move } from '@/lib/chess/play';
import {
  fenAt,
  formatClock,
  materialOf,
  numberedSan,
  sanLine,
  type Ply,
} from '@/lib/chess/replay';
import { formatScore, type Variation } from '@/lib/chess/score';
import { soundFor } from '@/lib/sound';

import { CoachBubble } from './coach-bubble';
import { CopyLink } from './copy-link';
import { EvalBar } from './eval-bar';
import { EngineLine } from './engine-line';
import { EvalGraph } from './eval-graph';
import { ExportPgn } from './export-pgn';
import { MoveList } from './move-list';
import { MoveTimes } from './move-times';
import { PlayerStrip } from './player-strip';
import { ReportCard } from './report-card';

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
  const { settings, setReviewIndex } = useStore();
  const last = replay.plies.length;
  const [index, setIndex] = useState(loaded.index);
  const [flipped, setFlipped] = useState(orientation === 'b');
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const column = useRef<HTMLDivElement>(null);
  const resize = useRef<{ x: number; y: number; w: number } | null>(null);
  // The position the viewer is coming from, held in the same state as the index
  // so a step is one atomic update: a later re-render (the engine streams in
  // constantly) must not be able to recompute the flight away.
  const [nav, setNav] = useState({ at: loaded.index, from: loaded.index });
  // A side line the user is playing out of position `index`. Navigating the
  // game itself (goTo) always leaves it.
  const [branch, setBranch] = useState<Branch | null>(null);

  const goTo = useCallback(
    (to: number) => {
      setBranch(null);
      setNav((prev) => {
        const next = Math.min(last, Math.max(0, to));
        if (next === prev.at) return prev;
        setIndex(next);
        return { at: next, from: prev.at };
      });
    },
    [last],
  );

  const go = useCallback(
    (to: number) => {
      setPlaying(false);
      goTo(to);
    },
    [goTo],
  );

  useEffect(() => {
    setReviewIndex(index);
  }, [index, setReviewIndex]);

  const running = playing && index < last;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => goTo(index + 1), settings.autoplayMs);
    return () => clearTimeout(t);
  }, [running, index, settings.autoplayMs, goTo]);

  // What the step keys and buttons move along: the side line when there is
  // one, else the game.
  const stepper = useMemo(
    () =>
      branch
        ? {
            at: branch.at,
            end: branch.plies.length,
            to: (n: number) => setBranch(stepTo(branch, n)),
          }
        : { at: index, end: last, to: go },
    [branch, index, last, go],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && branch) {
        e.preventDefault();
        setBranch(null);
        return;
      }
      if (e.key === ' ') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (branch) return;
        if (index >= last) goTo(0);
        setPlaying(index >= last || !running);
        return;
      }
      const { at, end, to } = stepper;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => to(at - 1),
        ArrowRight: () => to(at + 1),
        ArrowUp: () => to(0),
        ArrowDown: () => to(end),
        Home: () => to(0),
        End: () => to(end),
        f: () => setFlipped((f) => !f),
      };
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index, last, running, branch, stepper]);

  const analysis = useGameAnalysis(loaded, index);
  const here = analysis?.positions[index];
  const gameLine = here && here.status !== 'failed' ? here.line : null;
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
  const clocks = useMemo(() => moveClocks(replay), [replay]);
  const grade = grades[index - 1];
  const moving = movingPiece(replay, nav.at, nav.from);
  const prior = analysis?.positions[index - 1];

  // The side line's board is not a game position, so the probe searches it.
  // Back at the line's start it is the game position again, already analysed.
  const probeInput = useMemo(() => {
    if (!branch || branch.at === 0) return null;
    const fens = branchFens(replay, branch);
    return searchInputAt(fens, fens.length - 1);
  }, [replay, branch]);
  const probe = useProbe(probeInput);
  const probed = probeInput && probe.fen === probeInput.fen ? probe : null;
  const line = branch?.at ? (probed?.line ?? null) : gameLine;

  const { headers, plies } = replay;
  const ply = index > 0 ? plies[index - 1] : undefined;
  const sidePly = branch?.at ? branch.plies[branch.at - 1] : undefined;
  const shownPly = branch ? sidePly : ply;

  // One sound per move that appears on the board. Keyed by position, so leaving
  // a side line back onto the same move stays quiet, and the first render too.
  const sound = useSound();
  const heard = useRef(shownPly?.fen);
  useEffect(() => {
    if (shownPly && shownPly.fen !== heard.current) sound(soundFor(shownPly));
    heard.current = shownPly?.fen;
  }, [shownPly, sound]);

  /** `variation`'s first move from `fen`, unless it is `played`. */
  const alternative = (
    fen: string,
    variation: Variation | undefined,
    played: string | undefined,
  ) => {
    if (!variation || !played) return undefined;
    const san = sanLine(fen, variation.pv.slice(0, 1))[0];
    return san && san !== played
      ? { san, eval: formatScore(variation.score) }
      : undefined;
  };
  /** A graded move's alternative from the engine line before it. */
  const instead = (variation: Variation | undefined) => {
    const choice =
      grade && alternative(fenAt(replay, index - 1), variation, ply?.san);
    return choice && variation
      ? {
          ...choice,
          // Rewinds to the position the move was played in and plays the engine's instead.
          onPlay: () => {
            goTo(index - 1);
            setBranch(
              playLine(null, replay, index - 1, variation.pv.slice(0, 1)),
            );
          },
        }
      : undefined;
  };
  const before = prior?.status === 'done' ? prior.line : undefined;

  const fen = branch ? branchFen(replay, branch) : fenAt(replay, index);
  const material = materialOf(fen);
  const sideToMove = fen.split(' ')[1] as 'w' | 'b';
  const atEnd = index === last && !branch;

  // The side line's last move graded the way the game's moves are: by what it
  // cost against the engine line before it. Needs both lines settled.
  const sideBefore = (() => {
    if (!branch || !sidePly) return undefined;
    if (branch.at === 1) return here?.status === 'done' ? here.line : undefined;
    return probe.settled.get(branch.plies[branch.at - 2]!.fen);
  })();
  const sideAfter = probed?.done ? probed.line : null;
  const sideGrade =
    sidePly && sideBefore && sideAfter
      ? gradeSideMove(sidePly, sideBefore, sideAfter)
      : null;
  // The position the side line's last move was played from.
  const sideFrom =
    branch && branch.at > 0
      ? branch.at === 1
        ? fenAt(replay, branch.base)
        : branch.plies[branch.at - 2]!.fen
      : undefined;
  const sideWhy =
    sidePly && sideGrade && sideBefore && sideAfter && sideFrom
      ? explainMove(sideGrade, sideFrom, sidePly, sideBefore, sideAfter)
      : null;

  const input = useMoveInput(fen, (move: Move) => {
    if (!branch && isGameMove(replay, index, move)) return go(index + 1);
    const next = playMove(branch, replay, index, move);
    if (!next) return;
    setPlaying(false);
    setBranch(next);
  });

  const strip = (color: 'w' | 'b') => (
    <PlayerStrip
      color={color}
      name={headers[color === 'w' ? 'White' : 'Black'] ?? 'Unknown'}
      rating={headers[color === 'w' ? 'WhiteElo' : 'BlackElo']}
      captured={color === 'w' ? material.lost.b : material.lost.w}
      lead={Math.max(0, color === 'w' ? material.balance : -material.balance)}
      clock={branch ? undefined : clockShowing(replay, index, color)}
      toMove={sideToMove === color && !atEnd}
    />
  );
  const [top, bottom] = flipped ? (['w', 'b'] as const) : (['b', 'w'] as const);

  const eval_ = line ? formatScore(line.score) : undefined;
  const coach = (() => {
    if (index === 0)
      return {
        title: 'Ready when you are.',
        body: 'Step through with the arrow keys or click the graph, or move a piece to try a line.',
      };
    if (!grade || !ply)
      return {
        title: 'Still thinking about this one.',
        body: 'The coach speaks up once the engine has settled this move.',
      };
    const sentences = [];
    if (prior?.status === 'done' && here?.status === 'done') {
      const why = explainMove(
        grade,
        fenAt(replay, index - 1),
        ply,
        prior.line,
        here.line,
      );
      if (why) sentences.push(`${ply.san} ${why}.`);
      sentences.push(
        `The eval went from ${formatScore(prior.line.score)} to ${formatScore(here.line.score)}.`,
      );
    }
    const timing = clocks[index - 1];
    if (timing?.trouble)
      sentences.push(
        `Played in time trouble, with ${formatClock(timing.before)} on the clock.`,
      );
    else if (timing && MOMENT_GRADES.has(grade))
      sentences.push(`That took ${formatSpent(timing.spent)}.`);
    const result = headers.Termination ?? headers.Result;
    if (atEnd && result) sentences.push(`${result}.`);
    return { title: COACH_LINE[grade], body: sentences.join(' ') };
  })();

  // The engine's plan from the board, each move a way to play it out.
  const engineLine = line && (
    <EngineLine
      fen={fen}
      pv={line.pv}
      eval={formatScore(line.score)}
      onPlay={(count) => {
        const next = playLine(branch, replay, index, line.pv.slice(0, count));
        if (!next) return;
        setPlaying(false);
        setBranch(next);
      }}
    />
  );

  const sideChoice =
    sidePly && sideGrade && sideBefore && sideFrom
      ? alternative(sideFrom, sideBefore, sidePly.san)
      : undefined;
  const sideBest =
    branch && sideChoice && sideBefore
      ? {
          ...sideChoice,
          // Takes the last move back and plays the engine's in its place.
          onPlay: () =>
            setBranch(
              playLine(
                stepTo(branch, branch.at - 1),
                replay,
                index,
                sideBefore.pv.slice(0, 1),
              ),
            ),
        }
      : undefined;

  // A move the line reached without stopping on it has no line before it to be
  // graded against, so once its own search ends the title stops waiting.
  const sideTitle = sideGrade
    ? COACH_LINE[sideGrade]
    : sidePly && probe.unavailable
      ? 'The engine cannot run here.'
      : sidePly && !probed?.done
        ? 'Checking that move…'
        : 'Your side line.';

  const sideCoach = branch && (
    <CoachBubble
      grade={sideGrade ?? undefined}
      move={sidePly && sideGrade ? moveLabel(sidePly) : undefined}
      eval={sideGrade ? eval_ : undefined}
      best={sideBest}
      title={sideTitle}
      footer={engineLine}
      actions={
        <Button size="sm" onClick={() => setBranch(null)}>
          Back to the game
        </Button>
      }
    >
      {branch.at > 0
        ? `Not part of the game. ${numberedSan(
            fenAt(replay, branch.base),
            playedPlies(branch).map((p) => p.san),
          ).join(
            ' ',
          )}.${sideWhy && sidePly ? ` ${sidePly.san} ${sideWhy}.` : ''}`
        : 'Not part of the game. Play a move, or step forward to pick the line back up.'}
    </CoachBubble>
  );

  const labels = useMemo(
    () => [
      'Start',
      ...replay.plies.map((p, i) => {
        const at = analysis?.positions[i + 1];
        const spent = clocks[i]?.spent;
        return [
          moveLabel(p),
          at?.status === 'done' ? formatScore(at.line.score) : null,
          spent === undefined ? null : formatSpent(spent),
        ]
          .filter((part) => part !== null)
          .join('  ');
      }),
    ],
    [replay, analysis, clocks],
  );

  const stepButton = (
    label: string,
    icon: React.ReactNode,
    to: number,
    disabled: boolean,
  ) => (
    <Button size="icon-sm" onClick={() => stepper.to(to)} disabled={disabled}>
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
              pieceSet={settings.pieceSet}
              coordinates={settings.coordinates}
              lastMove={shownPly}
              checkOn={
                shownPly?.check ? (sideToMove === 'w' ? 'K' : 'k') : undefined
              }
              arrow={line?.pv[0]}
              second={line?.second?.pv[0]}
              moving={branch ? null : moving}
              grade={(branch ? sideGrade : grade) ?? null}
              play={input.play}
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
            stepper.at === 0,
          )}
          {stepButton(
            'Previous move',
            <ChevronLeftIcon aria-hidden />,
            stepper.at - 1,
            stepper.at === 0,
          )}
          <Button
            variant="primary"
            size="sm"
            aria-pressed={running}
            disabled={branch !== null}
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
            stepper.at + 1,
            stepper.at === stepper.end,
          )}
          {stepButton(
            'Last move',
            <ChevronsRightIcon aria-hidden />,
            stepper.end,
            stepper.at === stepper.end,
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
          {sideCoach ?? (
            <CoachBubble
              grade={grade ?? undefined}
              move={ply && grade ? moveLabel(ply) : undefined}
              eval={grade ? eval_ : undefined}
              best={instead(before)}
              next={instead(before?.second)}
              title={coach.title}
              footer={engineLine}
            >
              {coach.body}
            </CoachBubble>
          )}
          {input.promoting && (
            <div className="mt-3">
              <PromotionPicker onPick={input.promote} />
            </div>
          )}
          <div className="mt-3">
            <TypedMove
              fen={fen}
              label="Type a move to try a line"
              onMove={input.submit}
            />
          </div>
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
          <MoveTimes plies={plies} clocks={clocks} index={index} />
        </Panel>
        <ReportCard
          report={report}
          onJump={go}
          level={badgeLabel(
            loaded.level,
            here?.status === 'done' ? here.line : null,
          )}
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

/** Opens the newest saved review of one of your games, on your side. Nothing if there is none. */
function ReviewLatest() {
  const { reviewReplay } = useStore();
  const { records } = useSavedReviews();
  const usernames = useMemo(() => readSavedUsernames(), []);
  const latest = records?.find((r) => sideOf(r.replay.headers, usernames));
  if (!latest) return null;
  const { White, Black } = latest.replay.headers;
  return (
    <Button
      onClick={() =>
        reviewReplay(
          latest.replay,
          `${White ?? 'White'} vs ${Black ?? 'Black'}`,
          sideOf(latest.replay.headers, usernames)!,
          latest.level,
        )
      }
    >
      Review my latest game
    </Button>
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
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => navigate('games')}>
              Choose a game
            </Button>
            <ReviewLatest />
          </div>
        </Panel>
      </>
    );
  }
  return <Viewer key={loaded.id} loaded={loaded} />;
}
