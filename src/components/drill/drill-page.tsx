import { useMemo, useReducer, useState } from 'react';

import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { Board } from '@/components/board/board';
import { PromotionPicker } from '@/components/board/promotion-picker';
import { readSavedUsernames } from '@/components/game-picker/username-form';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { Panel } from '@/components/panel';
import { CoachBubble } from '@/components/review/coach-bubble';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMoveInput } from '@/hooks/use-move-input';
import { useSavedReviews } from '@/hooks/use-saved-reviews';
import {
  drillQueue,
  judge,
  type Drill,
  type Verdict,
} from '@/lib/analysis/drill';
import {
  finished,
  start,
  step,
  summary,
  type Action,
  type Session,
} from '@/lib/analysis/drill-session';
import { sideOf } from '@/lib/analysis/overview';
import { moveFromSan, type Move } from '@/lib/chess/play';

const SIDE = { w: 'White', b: 'Black' } as const;

const VERDICT_LINE: Record<Exclude<Verdict, 'best'>, string> = {
  played: 'That is the move you played.',
  other: "Not the engine's first choice.",
};

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
  const [miss, setMiss] = useState<Exclude<Verdict, 'best'> | null>(null);
  const open = phase === 'asking' || phase === 'wrong';
  const { record, fen } = drill;
  const { headers } = record.replay;

  function answer(move: Move) {
    const verdict = judge(drill, move);
    if (verdict !== 'best') setMiss(verdict);
    dispatch({ type: 'answer', verdict });
  }

  const input = useMoveInput(fen, answer, open);

  const actions = open ? (
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

  const coach = open ? (
    <CoachBubble
      title={phase === 'wrong' && miss ? VERDICT_LINE[miss] : 'Your move.'}
      actions={actions}
    >
      {phase === 'wrong'
        ? "Only the engine's top move counts."
        : `Move ${drill.moveNumber}, your game vs ${drill.opponent}. ${SIDE[drill.color]} to move. Find the engine's move.`}
    </CoachBubble>
  ) : (
    <CoachBubble
      grade={drill.grade}
      move={moveLabel(drill.moveNumber, drill.color, drill.played.san)}
      best={{ san: drill.best.san }}
      title={
        phase === 'solved' ? 'You found it.' : "Here is the engine's move."
      }
      actions={actions}
    >
      {`You played ${drill.played.san}, which cost ${drill.loss.toFixed(1)} points of winning chances. The engine goes ${numberedLine(drill)}.`}
    </CoachBubble>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex w-full flex-col gap-4 justify-self-center lg:max-w-[max(22rem,calc(100svh-17rem))]">
        <Board
          fen={fen}
          flipped={drill.color === 'b'}
          theme={settings.boardTheme}
          pieceSet={settings.pieceSet}
          coordinates={settings.coordinates}
          arrow={open ? undefined : drill.best.uci}
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

function DrillSession({
  queue,
  onRestart,
}: {
  queue: readonly Drill[];
  onRestart: () => void;
}) {
  const total = queue.length;
  const [session, dispatch] = useReducer(
    (s: Session, a: Action) => step(s, a, total),
    undefined,
    start,
  );

  if (finished(session, total)) {
    const counts = summary(session);
    return (
      <Panel tag="Done" title="That is every drill." className="max-w-xl">
        <p>
          Solved first try {counts['first-try']}, after retries {counts.retry},
          shown {counts.shown}, skipped {counts.skipped}
        </p>
        <div>
          <Button variant="primary" onClick={onRestart}>
            Start over
          </Button>
        </div>
      </Panel>
    );
  }

  const drill = queue[session.at]!;
  return (
    <>
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

export function DrillPage() {
  const { records } = useSavedReviews();
  const usernames = useMemo(() => readSavedUsernames(), []);
  const queue = useMemo(
    () => records && drillQueue(records, usernames),
    [records, usernames],
  );
  const [round, setRound] = useState(0);

  const header = (
    <PageHeader eyebrow="From your saved reviews">
      Drill your <Highlight>mistakes</Highlight>
    </PageHeader>
  );
  const goToGames = (label: string) => (
    <Button size="sm" variant="primary" onClick={() => navigate('games')}>
      {label}
    </Button>
  );

  if (!records || !queue)
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

  if (queue.length === 0)
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

  return (
    <>
      {header}
      <DrillSession
        key={`${round}:${queue.map((d) => d.id).join()}`}
        queue={queue}
        onRestart={() => setRound((r) => r + 1)}
      />
    </>
  );
}
