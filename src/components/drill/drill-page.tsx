import { FlameIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { navigate, useParams } from '@/app/router';
import { useStore } from '@/app/store';
import { Board } from '@/components/board/board';
import { PromotionPicker } from '@/components/board/promotion-picker';
import { PageHeader } from '@/components/layout/page-header';
import { Panel } from '@/components/panel';
import { CoachBubble } from '@/components/review/coach-bubble';
import { Button } from '@/components/ui/button';
import { useDrillProgress, useProbe } from '@/hooks/use-game-analysis';
import { useMoveInput } from '@/hooks/use-move-input';
import { useMyNames } from '@/hooks/use-my-names';
import { useOpeningBook } from '@/hooks/use-opening-book';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { useSound } from '@/hooks/use-sound';
import { useSavedReviews } from '@/hooks/use-saved-reviews';
import {
  drillQueue,
  drillReason,
  judge,
  searched,
  type Attempt,
  type Drill,
  type Verdict,
} from '@/lib/analysis/drill';
import { hintOf, hintsIn } from '@/lib/analysis/drill-hint';
import { plan, type DrillProgress } from '@/lib/analysis/drill-progress';
import {
  current,
  loadStreak,
  mark,
  saveStreak,
} from '@/lib/analysis/drill-streak';
import {
  DRILL_GRADES,
  DRILL_STAGES,
  drillHash,
  drillLabel,
  filterDrills,
  isFiltered,
  NO_DRILL_FILTER,
  openingOfDrill,
  readDrillFilter,
  speedOfDrill,
  type DrillFilter,
} from '@/lib/analysis/drill-filter';
import {
  loadSize,
  saveSize,
  SIZES,
  take,
  type Size,
} from '@/lib/analysis/drill-size';
import {
  finished,
  start,
  step,
  summary,
  type Action,
  type Result,
  type Session,
} from '@/lib/analysis/drill-session';
import { openingKey, sideOf } from '@/lib/analysis/overview';
import { searchInputAt } from '@/lib/analysis/inputs';
import { branchFens, playMove } from '@/lib/chess/branch';
import type { Move } from '@/lib/chess/play';
import { STAGES } from '@/lib/chess/stage';
import { SPEEDS } from '@/lib/chesscom/list-filter';
import type { TimeClass } from '@/lib/chesscom/types';
import type { Sound } from '@/lib/sound';

const SIDE = { w: 'White', b: 'Black' } as const;

const MISS_LINE: Record<'played' | 'other', string> = {
  played: 'That is the move you played.',
  other: "Not the engine's first choice.",
};

const CONTROLS = 'button, a, input, textarea, select';

const verdictSound = (v: Verdict): Sound =>
  v === 'best' || v === 'close' ? 'correct' : 'wrong';

const date = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

/** "4… Bxf3" for Black's move 4, "5. Qxd8+" for White's. */
const moveLabel = (moveNumber: number, color: 'w' | 'b', san: string) =>
  `${moveNumber}${color === 'w' ? '.' : '…'} ${san}`;

/** The engine line with move numbers: "4… dxe5 5. Qxd8+ Kxd8". */
function numberedLine(drill: Drill) {
  let n = drill.moveNumber;
  let color = drill.color;
  return drill.line
    .map((san, i) => {
      const text =
        color === 'w'
          ? `${n}. ${san}`
          : i === 0
            ? moveLabel(n, color, san)
            : san;
      if (color === 'b') n++;
      color = color === 'w' ? 'b' : 'w';
      return text;
    })
    .join(' ');
}

/** One puzzle. Keyed by drill id, so the selection resets on each position. */
function DrillCard({
  drill,
  phase,
  hints,
  controls,
  dispatch,
}: {
  drill: Drill;
  phase: Session['phase'];
  hints: number;
  /** The size and filter pickers, beside the coach until the first answer. */
  controls: ReactNode;
  dispatch: (action: Action) => void;
}) {
  const { settings, reviewReplay } = useStore();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const open = phase === 'asking' || phase === 'wrong';
  const { record, fen } = drill;
  const { headers } = record.replay;
  // Keeps looking after the verdict, so the snapshot still holds it.
  const probe = useProbe(attempt && 'input' in attempt ? attempt.input : null);
  const judged =
    attempt &&
    ('judged' in attempt
      ? attempt.judged
      : searched(drill, attempt.input, probe));

  const sound = useSound();

  const checked = phase === 'checking' ? judged?.verdict : undefined;
  useEffect(() => {
    if (!checked) return;
    dispatch({ type: 'checked', verdict: checked });
    sound(verdictSound(checked));
  }, [checked, dispatch, sound]);

  function answer(move: Move) {
    const branch = playMove(null, record.replay, drill.index - 1, move);
    if (!branch) return;
    const ply = branch.plies[0]!;
    const verdict = judge(drill, move);
    if (verdict) {
      const loss = verdict === 'played' ? drill.loss : null;
      setAttempt({ ply, judged: { verdict, loss } });
      dispatch({ type: 'answer', verdict });
      sound(verdictSound(verdict));
      return;
    }
    const fens = branchFens(record.replay, branch);
    setAttempt({ ply, input: searchInputAt(fens, fens.length - 1) });
    dispatch({ type: 'check' });
  }

  const input = useMoveInput(fen, answer, open);

  // Enter moves on once the drill is settled, unless it is a control's own key.
  const settled = !open && phase !== 'checking';
  const help = useShortcuts([
    {
      keys: ['Enter'],
      label: 'Next drill, once this one is settled',
      run: (e) => {
        if (!settled || e.repeat) return false;
        if (e.target instanceof Element && e.target.closest(CONTROLS))
          return false;
        dispatch({ type: 'next' });
      },
    },
  ]);

  const hint = useMemo(() => hintOf(drill), [drill]);
  const hinting = open && hints > 0;

  const actions =
    open || phase === 'checking' ? (
      <>
        {open && hints < hintsIn(hint) && (
          <Button size="sm" onClick={() => dispatch({ type: 'hint' })}>
            {hints === 0 ? 'Hint' : 'Another hint'}
          </Button>
        )}
        <Button size="sm" onClick={() => dispatch({ type: 'show' })}>
          Show answer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => dispatch({ type: 'skip' })}
        >
          Skip
        </Button>
      </>
    ) : (
      <>
        <Button
          size="sm"
          variant="primary"
          aria-keyshortcuts="Enter"
          title="Enter"
          onClick={() => dispatch({ type: 'next' })}
        >
          Next drill
        </Button>
        <Button
          size="sm"
          onClick={() =>
            reviewReplay(
              record.replay,
              `${headers.White ?? 'White'} vs ${headers.Black ?? 'Black'}`,
              drill.color,
              record.level,
            )
          }
        >
          Review this game
        </Button>
      </>
    );

  const missed =
    phase === 'wrong' &&
    (judged?.verdict === 'played' || judged?.verdict === 'other')
      ? judged.verdict
      : null;
  const close = phase === 'solved' && judged?.verdict === 'close';
  const reason = useMemo(() => drillReason(drill), [drill]);

  const coach =
    phase === 'checking' && attempt ? (
      <CoachBubble title="Checking that move…" actions={actions}>
        {`The engine is looking at ${attempt.ply.san}.`}
      </CoachBubble>
    ) : open ? (
      <CoachBubble
        title={missed ? MISS_LINE[missed] : 'Your move.'}
        actions={actions}
      >
        {missed
          ? `${judged!.loss === null ? '' : `${attempt!.ply.san} gives up ${judged!.loss.toFixed(1)} points of winning chances. `}The engine's move, or one nearly as good, solves it.`
          : `Move ${drill.moveNumber}, your game vs ${drill.opponent}. ${SIDE[drill.color]} to move. Find the engine's move, or one nearly as good.`}
        {hinting && (
          <span className="mt-2 block font-bold">
            {hints === 1
              ? 'Hint: the highlighted piece is the one to move.'
              : `Hint: ${hint.theme}`}
          </span>
        )}
      </CoachBubble>
    ) : (
      <CoachBubble
        grade={drill.grade}
        move={moveLabel(drill.moveNumber, drill.color, drill.played.san)}
        best={{ san: drill.best.san }}
        title={
          close
            ? 'Close enough.'
            : phase === 'solved'
              ? 'You found it.'
              : "Here is the engine's move."
        }
        actions={actions}
      >
        {`${close ? `${attempt!.ply.san} is nearly as good as the engine's ${drill.best.san}. ` : ''}You played ${drill.played.san}, which cost ${drill.loss.toFixed(1)} points of winning chances. ${reason ? `It ${reason}. ` : ''}The engine goes ${numberedLine(drill)}.`}
      </CoachBubble>
    );

  const trying = phase === 'checking' && attempt;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex w-full flex-col gap-4 justify-self-center lg:max-w-[max(22rem,calc(100svh-17rem))]">
        <Board
          fen={trying ? attempt.ply.fen : fen}
          flipped={drill.color === 'b'}
          theme={settings.boardTheme}
          pieceSet={settings.pieceSet}
          coordinates={settings.coordinates}
          lastMove={trying ? attempt.ply : undefined}
          arrow={open || trying ? undefined : drill.best.uci}
          hint={hinting ? hint.from : undefined}
          play={input.play}
        />
        {input.promoting && <PromotionPicker onPick={input.promote} />}
      </div>
      <div className="flex flex-col gap-6">
        {coach}
        {controls}
        <div>{help}</div>
      </div>
    </div>
  );
}

/** 5 / 10 / All, with how many drills are waiting. */
function SizePicker({
  value,
  onChange,
  available,
  practice,
}: {
  value: Size;
  onChange: (size: Size) => void;
  available: number;
  practice: boolean;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-3 border-0 p-0">
      <legend className="sr-only">Session size</legend>
      <span className="font-bold" aria-hidden>
        Session
      </span>
      {SIZES.map((size) => (
        <label
          key={size}
          className="border-line bg-surface text-ink has-[:checked]:bg-primary has-[:checked]:text-sticker-ink has-[:focus-visible]:outline-focus cursor-pointer rounded-sm border-2 px-3 py-1.5 text-[13px] font-bold has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2"
        >
          <input
            type="radio"
            name="drill-size"
            className="sr-only"
            checked={value === size}
            onChange={() => onChange(size)}
          />
          {size === 'all' ? 'All' : size}
        </label>
      ))}
      <span className="text-ink-muted">
        {available} {practice ? 'resting' : 'due'}
      </span>
    </fieldset>
  );
}

const GRADE_NAMES = { mistake: 'Mistake', miss: 'Miss', blunder: 'Blunder' };

/** Grade and stage chips and an opening list, to work on one weakness at a time. */
function DrillFilters({
  filter,
  openings,
  speeds,
  onChange,
}: {
  filter: DrillFilter;
  /** Every opening a drill comes from, sorted. */
  openings: readonly string[];
  /** Every speed a drill's game was played at. */
  speeds: readonly TimeClass[];
  onChange: (filter: DrillFilter) => void;
}) {
  const chip = (active: boolean, name: string, patch: Partial<DrillFilter>) => (
    <Button
      key={name}
      size="sm"
      variant={active ? 'primary' : 'default'}
      aria-pressed={active}
      onClick={() => onChange({ ...filter, ...patch })}
    >
      {name}
    </Button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Grade" className="flex flex-wrap gap-2">
        {chip(filter.grade === 'all', 'Any grade', { grade: 'all' })}
        {DRILL_GRADES.map((g) =>
          chip(filter.grade === g, GRADE_NAMES[g], { grade: g }),
        )}
      </div>
      <div role="group" aria-label="Stage" className="flex flex-wrap gap-2">
        {chip(filter.stage === 'all', 'Any stage', { stage: 'all' })}
        {DRILL_STAGES.map((st) =>
          chip(filter.stage === st, STAGES[st].label, { stage: st }),
        )}
      </div>
      <div role="group" aria-label="Side" className="flex flex-wrap gap-2">
        {chip(filter.side === 'all', 'Either side', { side: 'all' })}
        {chip(filter.side === 'w', 'White', { side: 'w' })}
        {chip(filter.side === 'b', 'Black', { side: 'b' })}
      </div>
      <div
        role="group"
        aria-label="Time control"
        className="flex flex-wrap gap-2"
      >
        {chip(filter.speed === 'all', 'Any speed', { speed: 'all' })}
        {speeds.map((sp) =>
          chip(filter.speed === sp, sp[0]!.toUpperCase() + sp.slice(1), {
            speed: sp,
          }),
        )}
      </div>
      <label className="flex flex-col gap-1 font-bold">
        Opening
        <select
          value={filter.opening ?? ''}
          onChange={(e) =>
            onChange({ ...filter, opening: e.target.value || null })
          }
          className="border-line bg-surface-alt text-ink w-full rounded-sm border-2 px-2 py-1.5 font-bold"
        >
          <option value="">Any opening</option>
          {openings.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DrillSession({
  queue,
  available,
  controls,
  onResult,
  practice,
  onRestart,
}: {
  /** The drills of this sitting: the top of the plan, up to `size`. */
  queue: readonly Drill[];
  /** How many drills the plan holds, of which `queue` is the top. */
  available: number;
  /** The size and filter pickers, shown until the first answer. */
  controls: ReactNode;
  /** null where nothing can be saved, and during a practice pass. */
  onResult: ((drill: Drill, result: Result) => void) | null;
  /** A pass over resting drills. Answers are not recorded. */
  practice: boolean;
  onRestart: () => void;
}) {
  const total = queue.length;
  const [session, dispatch] = useReducer(
    (s: Session, a: Action) => step(s, a, total),
    undefined,
    start,
  );

  // results[i] is written once per drill; the ref keeps a re-run effect from saving it twice.
  const saved = useRef(0);
  useEffect(() => {
    for (; saved.current < session.results.length; saved.current++)
      onResult?.(queue[saved.current]!, session.results[saved.current]!);
  }, [session.results, queue, onResult]);

  if (finished(session, total)) {
    const counts = summary(session);
    const capped = total < available;
    return (
      <Panel
        title={capped ? 'That is your session.' : 'That is every drill.'}
        className="max-w-xl"
      >
        <p>
          Solved first try {counts['first-try']}, after retries {counts.retry},
          shown {counts.shown}, skipped {counts.skipped}
        </p>
        {practice ? (
          <p className="text-ink-muted">
            Nothing was saved. They come back on the same day.
          </p>
        ) : (
          onResult && (
            <p className="text-ink-muted">
              The ones you missed come back next time. The ones you solved rest
              for a while.
            </p>
          )
        )}
        <div>
          <Button variant="primary" onClick={onRestart}>
            {capped && onResult ? 'Keep going' : 'Start over'}
          </Button>
        </div>
      </Panel>
    );
  }

  const drill = queue[session.at]!;
  const unstarted =
    session.at === 0 &&
    session.phase === 'asking' &&
    session.hints === 0 &&
    !session.results.length;
  return (
    <>
      <p className="font-mono font-bold tabular-nums">
        Drill {session.at + 1} of {total}
      </p>
      <DrillCard
        key={drill.id}
        drill={drill}
        phase={session.phase}
        hints={session.hints}
        controls={unstarted && controls}
        dispatch={dispatch}
      />
    </>
  );
}

/** What has been answered so far, read once per round so a session's queue holds still. */
function useProgressAt(round: number) {
  const store = useDrillProgress();
  const [progress, setProgress] = useState<{
    round: number;
    now: number;
    byId: ReadonlyMap<string, DrillProgress>;
  } | null>(null);
  useEffect(() => {
    let current = true;
    (store?.list() ?? Promise.resolve([])).then(
      (list) =>
        current &&
        setProgress({
          round,
          now: Date.now(),
          byId: new Map(list.map((p) => [p.id, p])),
        }),
    );
    return () => {
      current = false;
    };
  }, [store, round]);

  const onResult = useMemo(
    () =>
      store &&
      ((drill: Drill, result: Result) =>
        void store.record(drill.id, result, Date.now())),
    [store],
  );
  return { progress: progress?.round === round ? progress : null, onResult };
}

export function DrillPage() {
  const { records } = useSavedReviews();
  // Book moves are never drills; until the table loads, none are Book.
  const book = useOpeningBook();
  const usernames = useMyNames();
  const [round, setRound] = useState(0);
  const [practice, setPractice] = useState(false);
  const [size, setSize] = useState(loadSize);
  const params = useParams();
  const filter = useMemo(() => readDrillFilter(params), [params]);
  const { progress, onResult: record } = useProgressAt(round);
  const [streak, setStreak] = useState(loadStreak);
  // The day shown moves on at an answer, not at midnight on a page left open.
  const [now, setNow] = useState(Date.now);
  const onResult = useMemo(
    () =>
      record &&
      ((drill: Drill, result: Result) => {
        record(drill, result);
        if (result === 'skipped') return;
        const at = Date.now();
        const next = mark(streak, at);
        saveStreak(next);
        setStreak(next);
        setNow(at);
      }),
    [record, streak],
  );
  const planned = useMemo(
    () =>
      records &&
      progress &&
      plan(
        drillQueue(records, usernames, book ?? null),
        progress.byId,
        progress.now,
      ),
    [records, usernames, progress, book],
  );
  // What the lists offer: every opening and speed among the drills, due or resting.
  const everything = useMemo(
    () => [...(planned?.due ?? []), ...(planned?.later ?? [])],
    [planned],
  );
  const { openings, speeds } = useMemo(() => {
    // One entry per opening as the Overview groups them; the one asked for wins.
    const byKey = new Map<string, string>();
    if (filter.opening !== null)
      byKey.set(openingKey(filter.opening), filter.opening);
    for (const drill of everything) {
      const name = openingOfDrill(drill, book ?? null);
      if (name && !byKey.has(openingKey(name)))
        byKey.set(openingKey(name), name);
    }
    const played = new Set(everything.map(speedOfDrill));
    return {
      openings: [...byKey.values()].sort(),
      speeds: SPEEDS.filter((sp) => played.has(sp)),
    };
  }, [everything, book, filter.opening]);

  // A filtered page says what it holds: "Drill your 6 Caro-Kann Defense mistakes".
  const held =
    planned && book !== undefined && isFiltered(filter)
      ? filterDrills(everything, filter, book).length
      : null;
  const header = (
    <PageHeader>
      Drill your {held === null ? 'mistakes' : drillLabel(filter, held)}
    </PageHeader>
  );
  const alive = current(streak, now);
  const streakNote = alive.run > 0 && (
    <p
      aria-live="polite"
      className="border-line bg-surface-alt inline-flex w-fit items-center gap-2 rounded-sm border-2 px-3 py-1.5 font-bold"
    >
      <FlameIcon aria-hidden className="size-5" />
      {alive.run} {alive.run === 1 ? 'day' : 'days'} in a row
      <span className="text-ink-muted text-sm font-normal">
        {alive.today ? 'Done for today.' : 'Answer a drill today to keep it.'}
      </span>
    </p>
  );
  const goToGames = (label: string) => (
    <Button size="sm" variant="primary" onClick={() => navigate('games')}>
      {label}
    </Button>
  );

  if (!records || !planned || book === undefined)
    return (
      <>
        {header}
        <p
          aria-busy
          className="text-ink-muted grid min-h-96 place-items-center"
        >
          Loading…
        </p>
      </>
    );

  if (records.length === 0)
    return (
      <>
        {header}
        <CoachBubble
          title="Nothing reviewed yet."
          actions={goToGames('Pick a game')}
        >
          Review a game and it is saved in this browser. Your mistakes from it
          become drills here.
        </CoachBubble>
      </>
    );

  if (!records.some((r) => sideOf(r.replay.headers, usernames, r.replay.mine)))
    return (
      <>
        {header}
        <CoachBubble
          title="None of these games are yours."
          actions={goToGames('Go to Games')}
        >
          I match games to you by your Chess.com or Lichess username, or by an
          extra name added in Settings. Load yours on the Games page, or add the
          name you play under in Settings, and review a game of yours to drill
          its mistakes.
        </CoachBubble>
      </>
    );

  if (planned.due.length === 0 && planned.later.length === 0)
    return (
      <>
        {header}
        <CoachBubble
          title="Clean sheet."
          actions={goToGames('Review another game')}
        >
          No mistakes, misses or blunders in your reviewed games. Nothing to
          drill yet.
        </CoachBubble>
      </>
    );

  const waiting = filterDrills(
    practice ? planned.later : planned.due,
    filter,
    book,
  );
  const queue = take(waiting, size);
  if (planned.due.length === 0 && !practice) {
    const next = progress!.byId.get(planned.later[0]!.id)!.due;
    return (
      <>
        {header}
        {streakNote}
        <CoachBubble
          title="All caught up."
          actions={
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setPractice(true)}
              >
                Drill them anyway
              </Button>
              {goToGames('Review another game')}
            </>
          }
        >
          {`You have been through every drill. The next one comes back on ${date.format(next)}. Drilling them now does not move that.`}
        </CoachBubble>
      </>
    );
  }

  const setFilter = (next: DrillFilter) =>
    location.replace(`#${drillHash(next)}`);
  const filters = (
    <DrillFilters
      filter={filter}
      openings={openings}
      speeds={speeds}
      onChange={setFilter}
    />
  );

  if (waiting.length === 0)
    return (
      <>
        {header}
        {streakNote}
        {filters}
        <CoachBubble
          title="Nothing matches."
          actions={
            <Button
              size="sm"
              variant="primary"
              onClick={() => setFilter(NO_DRILL_FILTER)}
            >
              Clear filters
            </Button>
          }
        >
          {`No ${practice ? 'resting' : 'due'} drills match these filters.`}
        </CoachBubble>
      </>
    );

  return (
    <>
      {header}
      {streakNote}
      <DrillSession
        key={`${round}:${queue.map((d) => d.id).join()}`}
        queue={queue}
        available={waiting.length}
        controls={
          <>
            {filters}
            <SizePicker
              value={size}
              onChange={(next) => {
                saveSize(next);
                setSize(next);
              }}
              available={waiting.length}
              practice={practice}
            />
          </>
        }
        onResult={practice ? null : onResult}
        practice={practice}
        onRestart={() => {
          setPractice(false);
          setRound((r) => r + 1);
        }}
      />
    </>
  );
}
