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
import { readSavedUsernames } from '@/components/game-picker/username-form';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { Panel } from '@/components/panel';
import { CoachBubble } from '@/components/review/coach-bubble';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOpeningBook } from '@/hooks/use-opening-book';
import { useDrillProgress, useProbe } from '@/hooks/use-game-analysis';
import { useMoveInput } from '@/hooks/use-move-input';
import { useSound } from '@/hooks/use-sound';
import { useSavedReviews } from '@/hooks/use-saved-reviews';
import {
  drillQueue,
  judge,
  judgeAfter,
  type Drill,
  type Verdict,
} from '@/lib/analysis/drill';
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
  filterDrills,
  NO_DRILL_FILTER,
  openingOfDrill,
  readDrillFilter,
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
import { searchInputAt } from '@/lib/analysis/inputs';
import { sideOf } from '@/lib/analysis/overview';
import type { ProbeInput, ProbeSnapshot } from '@/lib/analysis/probe';
import { branchFens, playMove } from '@/lib/chess/branch';
import { moveFromSan, type Move } from '@/lib/chess/play';
import type { Ply } from '@/lib/chess/replay';
import { STAGES } from '@/lib/chess/stage';
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

function TypedMove({
  fen,
  onMove,
}: {
  fen: string;
  onMove: (m: Move) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const move = moveFromSan(fen, text);
    setError(!move);
    if (!move) return;
    setText('');
    onMove(move);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="drill-move" className="font-bold">
        Type your move
      </label>
      <div className="flex gap-2">
        <Input
          id="drill-move"
          value={text}
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. Nf3"
          aria-invalid={error || undefined}
          aria-describedby={error ? 'drill-move-error' : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
        />
        <Button type="submit">Play</Button>
      </div>
      {error && (
        <p id="drill-move-error" role="alert" className="text-ink font-bold">
          That is not a legal move here.
        </p>
      )}
    </form>
  );
}

type Judged = { verdict: Verdict; loss: number | null };

/** A move tried on a drill: judged from the saved lines, or waiting on a search of the position it leads to. */
type Attempt = { ply: Ply } & ({ judged: Judged } | { input: ProbeInput });

/** The search's verdict on `input`; null while it runs. No engine means the move falls short. */
function searched(
  drill: Drill,
  input: ProbeInput,
  probe: ProbeSnapshot,
): Judged | null {
  if (probe.fen !== input.fen) return null;
  if (probe.unavailable) return { verdict: 'other', loss: null };
  if (!probe.done) return null;
  return probe.line
    ? judgeAfter(drill, probe.line)
    : { verdict: 'other', loss: null };
}

/** One puzzle. Keyed by drill id, so the selection resets on each position. */
function DrillCard({
  drill,
  phase,
  dispatch,
}: {
  drill: Drill;
  phase: Session['phase'];
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
  useEffect(() => {
    if (!settled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(CONTROLS)) return;
      e.preventDefault();
      dispatch({ type: 'next' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settled, dispatch]);

  const actions =
    open || phase === 'checking' ? (
      <>
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
        {`${close ? `${attempt!.ply.san} is nearly as good as the engine's ${drill.best.san}. ` : ''}You played ${drill.played.san}, which cost ${drill.loss.toFixed(1)} points of winning chances. The engine goes ${numberedLine(drill)}.`}
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
          play={input.play}
        />
        {input.promoting && <PromotionPicker onPick={input.promote} />}
      </div>
      <div className="flex flex-col gap-6">
        {coach}
        {open && (
          <Panel>
            <TypedMove fen={fen} onMove={input.submit} />
          </Panel>
        )}
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
          className="border-line bg-surface text-ink has-[:checked]:bg-primary has-[:checked]:text-sticker-ink has-[:focus-visible]:outline-focus cursor-pointer rounded-sm border-3 px-3 py-1.5 text-[13px] font-extrabold uppercase has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2"
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
  onChange,
}: {
  filter: DrillFilter;
  /** Every opening a drill comes from, sorted. */
  openings: readonly string[];
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
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
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
      <label className="flex items-center gap-2 font-bold">
        Opening
        <select
          value={filter.opening ?? ''}
          onChange={(e) =>
            onChange({ ...filter, opening: e.target.value || null })
          }
          className="border-line bg-surface-alt text-ink max-w-64 rounded-sm border-3 px-2 py-1.5 font-bold"
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
        tag="Done"
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
    session.at === 0 && session.phase === 'asking' && !session.results.length;
  return (
    <>
      {unstarted && controls}
      <p className="font-mono font-bold tabular-nums">
        Drill {session.at + 1} of {total}
      </p>
      <DrillCard
        key={drill.id}
        drill={drill}
        phase={session.phase}
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
  const usernames = useMemo(() => readSavedUsernames(), []);
  const [round, setRound] = useState(0);
  const [practice, setPractice] = useState(false);
  const [size, setSize] = useState(loadSize);
  const book = useOpeningBook();
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
      plan(drillQueue(records, usernames), progress.byId, progress.now),
    [records, usernames, progress],
  );
  const openings = useMemo(() => {
    const names = new Set(filter.opening === null ? [] : [filter.opening]);
    for (const drill of [...(planned?.due ?? []), ...(planned?.later ?? [])]) {
      const name = openingOfDrill(drill, book ?? null);
      if (name) names.add(name);
    }
    return [...names].sort();
  }, [planned, book, filter.opening]);

  const header = (
    <PageHeader eyebrow="From your saved reviews">
      Drill your <Highlight>mistakes</Highlight>
    </PageHeader>
  );
  const alive = current(streak, now);
  const streakNote = alive.run > 0 && (
    <p
      aria-live="polite"
      className="border-line bg-surface-alt inline-flex w-fit items-center gap-2 rounded-sm border-3 px-3 py-1.5 font-bold"
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

  if (!records.some((r) => sideOf(r.replay.headers, usernames)))
    return (
      <>
        {header}
        <CoachBubble
          title="None of these games are yours."
          actions={goToGames('Go to Games')}
        >
          I match games to you by your Chess.com or Lichess username. Load yours
          on the Games page and review a game of yours to drill its mistakes.
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
    <DrillFilters filter={filter} openings={openings} onChange={setFilter} />
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
