# DeepRook engine design

A chess engine written from scratch in TypeScript. It runs in Web Workers on the user's machine and analyzes a loaded game at one of three user-selected levels.

## Problem

The review page has no analysis. It needs a White-POV score, a best move, and a PV for every position index `0..N` of a game. These must survive route changes (`Viewer` unmounts on navigation) and fill in over time. Constraints from grounding:

- The store value is rebuilt unmemoized every render, so engine progress cannot flow through it.
- jsdom has no `Worker`.
- Static hosting sends no COOP/COEP headers, so there is no `SharedArrayBuffer`. A worker deep in a synchronous search cannot be told to stop.
- `noUncheckedIndexedAccess` puts `!` on typed-array reads in hot loops.
- `Material.balance` fixes the sign convention: positive is good for White.
- A remote server backend may come "very later". Always assume local.

## Usage (caller's view)

```tsx
// App.tsx: once, inside AppProvider, above Shell.
// The level follows the running review, not the setup radios, so choosing a
// mode for the next game cannot retarget the analysis in progress.
<AnalysisProvider level={loaded?.level ?? settings.analysisLevel}>{children}</AnalysisProvider>

// Viewer: one hook focuses the position and reads the whole-game document.
const analysis = useGameAnalysis(loaded, index); // GameAnalysis | null
const here = analysis?.positions[index];
const line = here && here.status !== 'failed' ? here.line : null;
<EvalBar score={line?.score ?? null} flipped={flipped} />
<Board ... arrow={line?.pv[0]} />            // UCI, e.g. 'e2e4'
<EnginePanel fen={fen} position={here} analysis={analysis} />

// ReviewSetup: picking a game only stages it. The radio list derives from the
// one table and sets the remembered mode; the button starts the review, which
// navigates and mounts the Viewer, and only then does the engine run.
{LEVELS.map((level) => <input type="radio" checked={settings.analysisLevel === level}
  onChange={() => setSettings({ analysisLevel: level })} />)}
<Button onClick={startReview}>Review game</Button> // loaded = { ...staged, level }

// Viewer: the in-review switcher changes the running review and the default.
<input type="radio" checked={loaded.level === level} onChange={() => setReviewLevel(level)} />
```

Components never see a worker, a job, a lane, or a side-to-move score. Lint blocks imports of engine and analysis internals from components.

## Shape

### Data first: the document

```ts
GameAnalysis     = { gameId; level; positions: readonly PositionAnalysis[]; done }
PositionAnalysis = { status: 'queued' | 'searching'; line: Line | null }
                 | { status: 'done'; line: Line } | { status: 'failed' }
Line             = { score: Score; pv: readonly string[] /* UCI */; depth }
Score            = { kind: 'cp'; cp } | { kind: 'mate'; winner: 'w' | 'b'; moves }  // White POV
```

The analyzer keeps one private `Entry = { line, settled, failed }` per position. It has two monotone writers. `mergeLine` keeps the deeper line. `settle` raises the settled level. A duplicate, late, or preempted message therefore cannot make the document worse (per make-operations-idempotent). Status is derived at flush time, not stored. Raising the level never blanks a position, and lowering it never discards deeper work.

### Determinism is the load-bearing property

`engine.search(request)` is a pure function of `(fen, history, limits)`:

- The transposition table, killers, and history are cleared per job.
- Zobrist keys come from a fixed seed.
- Depth and node caps are the semantic bounds. Time is only a safety cap and is reported as `reason: 'time'`.

Pool size, scheduling order, worker identity, and preemption therefore cannot change a result. A reopened game shows the same numbers. Adjacent plies are judged under identical conditions. A server running the same file returns identical answers.

### Levels (`src/lib/analysis/levels.ts`, the one table)

| Level              | Depth | Node cap | Time cap |
| ------------------ | ----- | -------- | -------- |
| fast               | 8     | 250k     | 1 s      |
| balanced (default) | 12    | 1.5M     | 5 s      |
| deep               | 16    | 10M      | 20 s     |

Per position, iterative deepening runs to `depth` and stops at whichever cap binds first. A partial iteration is discarded. The search also stops early on a proven mate. Key order is rank order, and a test asserts that every column strictly increases. Settings options, persisted-value validation, the scheduler, and the worker limits all derive from this table. The numbers are calibrated with `pnpm bench` (see Verification).

### Concurrency: lanes behind the document

- **Lanes.** `K = clamp(hardwareConcurrency - 1, 1, 8)` Web Workers, spawned lazily. Each has its own 8 MiB transposition table, cleared per job. There is no shared memory.
- **Scheduling.** A pure `plan(input) -> Command[]` decides the order:
  1. The focused position at the requested level, on an idle lane. When no lane is idle, slot 0 is preempted, but only after the focus has stayed put for 200 ms. Holding an arrow key therefore does not churn workers.
  2. A first-light pass at `fast` over every empty position, nearest the focus first. The whole-game picture appears in seconds even at Deep.
  3. Upgrades to the requested level, nearest the focus first.
- **Cancellation.** `terminate()` plus a lazy respawn. Every message carries a `jobId`, and the analyzer drops any `jobId` that doesn't match the slot's current job. Opening a new game terminates all busy lanes.
- **Streaming.** Workers post a `line` after each completed iteration. The analyzer merges them monotonically and flushes one immutable snapshot at most every 50 ms to `useSyncExternalStore`. Only subscribers re-render.

### Engine core (`src/lib/engine/`, pure TS)

- **Board.** 0x88 `Uint8Array(128)`. Moves are packed into an int32 (`from | to<<7 | flag<<14`). Generation is pseudo-legal, and `Position.make()` returns `false` and restores the position when the mover's king is left attacked. The castling path is attack-checked at generation.
- **Incremental state** in `put`/`remove`, the only writers of `board`: the Zobrist key (two int32 halves; `lo` indexes, `hi` verifies), the PeSTO mg/eg sums, the phase, and piece counts. `recompute()` lets tests assert the incremental values at every perft node.
- **Draws.** Repetition (the key stack includes the game-history positions back to the last irreversible move, sent as FENs in the job), the 50-move rule, and insufficient material.
- **Search.**
  - Iterative deepening, with aspiration windows from depth 5.
  - Fail-soft PVS with transposition-table cutoffs at non-PV nodes.
  - Mate-distance pruning and check extension.
  - Reverse futility pruning (depth ≤ 6), null move (R = 3 + d/6, needs a non-pawn piece), and log-table LMR.
  - Quiescence over captures and queen promotions, with full evasions when in check, plus delta pruning.
  - Move ordering: TT move, MVV-LVA captures, promotions, two killers, butterfly history.
  - The PV comes from a triangular table.
- **Scores.** Side-to-move ints internally; mate is `MATE - ply`. `toScore` in `engine.ts` is the only place the point of view flips. `winner` is explicit, so "mate in 0" is representable.
- **Moves leave the engine as UCI strings.** chess.js, which already owns SAN, converts the one displayed PV at the UI.

### Interface depth

The UI sees one provider, one hook, one settings field, the level table, and `formatScore`/`winPercent`. Hidden behind them:

- worker lifetime, pool size, job ids, and preemption with a dwell
- the first-light tier, merges, and coalesced flushes
- the point-of-view conversion and the whole engine

The analyzer has three verbs (`view`, `setLevel`, `dispose`) plus `subscribe`/`getSnapshot`. Per boundary-discipline, validation lives at three edges: `parseFen`, `parseSettings` (localStorage), and the worker message cast.

### Future-server seam

`SpawnLane` has two implementations today: the Web Worker and an in-process lane used by tests. A server would be a third that sends the same self-contained `Job` (FEN, history FENs, limits) and calls back with the same `FromEngine` messages. Determinism means it would return the same answers. No interface is added for it now.

### Persistence (`src/lib/analysis/cache.ts`)

Determinism is what makes a finished analysis worth keeping: the same game at the same level always yields the same lines. They are stored in IndexedDB so a refresh or a reopened game skips the engine.

- **One record per game, keyed by content.** `gameKey(replay)` is a 53-bit hash of the start FEN and every ply's FEN, so Chess.com and a pasted PGN of the same game share a record. `Loaded.id` is a per-session counter and cannot be the key. The record holds the best level reached, and `satisfies(record.level, wanted)` decides whether it covers a request. Nothing is keyed by level.
- **Shape.** `StoredAnalysis = { v, key, level, lines, replay, analyzedAt }`, with one `Line` per position and the replay kept so the Overview can grade and list the game without its source. `level` is the lowest level any position settled at.
- **Reads go through `parseStored`.** A wrong `CACHE_VERSION`, an unknown level, a line count other than plies + 1, or a malformed line or replay is a miss, never a throw. Bump `CACHE_VERSION` whenever the engine, its evaluation, or the `Line` shape changes.
- **Never breaks a review.** `openIdbStore()` is null without IndexedDB, and every IndexedDB failure resolves like a miss. `save` keeps the higher level, inside one transaction. Failed positions are never cached, so a game with one is not saved.
- **In the analyzer.** On a new game the analyzer marks it `loading` and plans nothing until the lookup settles, or until `CACHE_LOAD_MS` (1.5 s) passes so a hung database cannot stall analysis. A hit seeds each entry through `mergeLine` and `settle`, the same monotone writers the engine uses, so a late or repeated hit cannot make the document worse. A game is saved once every position has a line, none failed and all satisfy the current level, then again only after reaching a higher level.
- **Overview.** `summarize` grades a record with `classifyMoves` and `gameReport` and keeps the player's half. `overview` aggregates the games where the saved Chess.com username matches a PGN name, and lists the rest without counting them. The trend covers the latest 20 games. Grade mix, mistakes per stage and openings cover every saved game. The stage split in `src/lib/chess/stage.ts` is an approximation (endgame at six or fewer pieces besides pawns and kings, else opening until ply 20).

### Module map

```
src/lib/chess/score.ts           Score, Line, formatScore, winPercent (shared vocabulary)
src/lib/engine/board.ts          0x88 constants, packed Move, toUci
src/lib/engine/position.ts       Position: make/unmake, Zobrist, attacks, draws, parseFen
src/lib/engine/moves.ts          generateMoves, legalMoves
src/lib/engine/evaluate.ts       PeSTO tables, evaluate
src/lib/engine/tt.ts             TranspositionTable
src/lib/engine/search.ts         Searcher: ID, PVS, quiescence, ordering
src/lib/engine/engine.ts         createEngine, toScore  <- the engine's public entry
src/lib/analysis/levels.ts       ANALYSIS_LEVELS (the one table)
src/lib/analysis/game-analysis.ts  GameAnalysis, PositionAnalysis (the document)
src/lib/analysis/schedule.ts     plan(): focus, first light, upgrade (pure)
src/lib/analysis/protocol.ts     Job, FromEngine, Lane, SpawnLane, spawnWorkerLane
src/lib/analysis/analyzer.ts     createAnalyzer: entries, lanes, job ids, flush
src/lib/analysis/cache.ts        gameKey, parseStored, openIdbStore, memoryStore
src/lib/analysis/overview.ts     summarize, overview (pure, over saved records)
src/lib/chess/stage.ts           Stage, stageAt
src/workers/engine.worker.ts     thin shell around createEngine
src/hooks/use-game-analysis.tsx  AnalysisProvider, useGameAnalysis, useAnalysisStore  <- the UI's only door
src/components/review/engine-panel.tsx  EnginePanel
src/components/review/eval-bar.tsx      EvalBar
```

## Synthesis decision

The design was decided in an arena of three candidates:

- **C1:** one worker, position at a time.
- **C2:** worker pool, game as a batch.
- **C3:** the analysis document at the center, with lanes, a ladder of levels, and a backward walk.

The cross-judge (Sonnet) scored C3 highest on interface depth and resource use, but recommended **C2 as the base**. C2's invariants live in structure: pure search, a transposition table cleared per job, a monotone merge, and a pure planner. C3's results depend on its scheduler's behavior. I had leaned toward C3, re-read both rationales, and agreed with the judge. Reproducible evaluations and a simpler scheduler are worth more than the 20–40% fewer nodes that transposition-table reuse would save.

Grafted:

- **From C3:**
  - one hook, `useGameAnalysis(game, index)`, which focuses the position and reads the document (replaces C2's `useAnalysis` + `useAnalysisFocus`)
  - the status-tagged `PositionAnalysis` document
  - the focus lane with 200 ms dwell-gated preemption, which fixes C2's 4-core case where the focus waited behind Deep jobs
  - 50 ms coalesced snapshots
  - the `SpawnLane` seam with an in-process test lane
  - the chess.js differential test
- **From C1:**
  - streaming iterations, so Deep feels alive
  - `Score` with an explicit `winner`, converted in one place
  - persisting settings, parsed field by field at the localStorage boundary

Rejected:

- C3's backward walk, midpoint split, and persistent transposition table, because they break determinism and are the most complex part.
- C3's engine-side SAN, because it duplicates chess.js.
- C3's multi-rung ladder, replaced by C2's simpler two-tier first light.
- C2's one-legal-move depth-1 shortcut, because it gives forced moves a bad evaluation for classification.
- C2's `poolMemoryBytes`, as speculation.
- C1's single worker, which leaves the user's cores idle.

## Tradeoffs accepted

- We accept no transposition-table reuse across positions (more nodes per position) in exchange for deterministic results that don't depend on order or pool size.
- We accept losing a preempted job's work in exchange for real cancellation without `SharedArrayBuffer`. Only slot 0 is preempted, and only after the dwell.
- We accept a first-light pass at `fast` (about 1% of Deep's node budget) in exchange for a whole-game picture within seconds.
- We accept up to 8 workers × about 10 MiB in exchange for using the user's cores.
- We accept that a time cap makes a result machine-dependent on slow devices. It's reported as `reason: 'time'`, and `Line.depth` shows what was reached.
- We accept a PeSTO-only evaluation, with no tuner and no SEE, in exchange for a known-good baseline. _ponytail: add SEE and a Texel tuner when the bench and tactics suite justify them._
- We accept `!` on typed-array reads in the engine in exchange for zero-allocation hot loops.
- We accept unbranded int moves inside the engine. They never leave it; UCI strings are the public form.

## Alternatives considered

- **Lazy SMP or root splitting across workers.** Without `SharedArrayBuffer` there is no shared transposition table, so it scales poorly and the complexity leaks into search. Parallelism across a game's positions scales almost linearly for free.
- **Cooperative stop (yield every N nodes) instead of `terminate()`.** It would keep the worker warm, but it threads a message pump through a recursive search. Because the transposition table is cleared per job anyway, it would save nothing.
- **Analysis state in the app store.** This is the shallowest wiring, but every streamed iteration would re-render the whole app.
- **Levels as pure time budgets.** They would give predictable wall time, but results would vary by machine and be impossible to cache or test.
- **Bitboards (BigInt or 32-bit halves).** BigInt allocates, and 32-bit halves double every operation. In JS, 0x88 is competitive and far less code.

## Verification

- **Perft** (`perft.test.ts`): the six reference positions from the Chess Programming Wiki. By default it runs every depth up to 500k leaves. `PERFT_FULL=1` adds start d5 (4,865,609), Kiwipete d4 (4,085,603), pos3 d5 (674,624), pos5 d4 (2,103,487), and pos6 d4 (3,894,594); all pass. A second pass checks the incremental hash, PST sums, and phase against `recompute()` at every node. A differential test compares the legal-move set with chess.js across seeded random playouts. FEN round-trips and malformed FENs are rejected.
- **Search** (`engine.test.ts`):
  - mate in 1 for each side, with White-POV signs
  - the Opera Game mate in 2 with its exact PV, and mate 0 on the board
  - stalemate, a hanging queen, and a promotion suffix
  - color-symmetric static eval
  - a repetition through game history scores 0
  - determinism (same request gives the same line and node count)
  - the node cap binding, and iterations streaming in order
- **Scheduling and analyzer** (`schedule.test.ts`, `analyzer.test.ts`): the plan's priority order, the dwell-gated preemption, and no duplicate or redone work. Also streaming into the document, stale messages after a game switch, raising and lowering the level, monotone lines, history FENs in jobs, and the no-Worker case. These use scripted lanes and fake timers.
- **App** (`analysis.test.tsx`): an in-process `Worker` stub runs the real engine through the real analyzer, hook, panel, and arrow. On Opera position 30 it shows `#2`, `Qb8+ Nxb8 Rd8#`, and a b3→b8 arrow. The level setting persists across a remount. `staging.test.tsx` counts the stub's jobs: staging posts none, and Review game posts some.
- **Bench** (`pnpm bench`): 8 fixed positions on the engine bundled the way the worker ships. Measured on a 12-thread dev machine at about 1.7M nodes per second per core:

  | Level    | Per position (avg) | Typical middlegame depth | Bound that binds         |
  | -------- | ------------------ | ------------------------ | ------------------------ |
  | fast     | ~0.15 s            | 8                        | depth or nodes           |
  | balanced | ~0.7 s             | 10–12                    | nodes; depth in endgames |
  | deep     | ~5 s               | 13–16                    | nodes; depth in endgames |

  The time caps never bound on this machine, so results here are deterministic. A machine about 3× slower reaches the Deep time cap.

- **Real artifacts**:
  - `astro build` emits `engine.worker-*.js` as a self-contained IIFE. Run under Node with a fake `self`, the bundle streams 9 lines and returns `done` at depth 8.
  - The dev server serves the worker module.
  - It was not driven in a real browser in this session (no browser tool was available).

## Implementation reconciliation

The orchestrator accepted every deviation below against this design.

- **Fast node cap 150k → 250k.** The bench showed Fast reaching only depth 7 in middlegames at 150k. Contract unchanged: it's a table value.
- **Bench is a script, not a Vitest test.** Vitest's module transform turns imported constants into property lookups in the hot loop: 0.3M vs 1.7M nodes per second measured. `scripts/bench.mjs` bundles with Vite first. This is a local deviation with no contract impact.
- **Engine tests run in jsdom, not the node environment.** The shared `vitest.setup.ts` touches `localStorage`. This is local.
- **EvalBar is a vertical bar beside the board, as sketched in Usage.** It first shipped as a horizontal win-chance meter inside `EnginePanel`, because a vertical bar would have entangled the board column's resize logic. The full-height review layout made the board column a grid, and the bar now has its own track beside the board. It reads the same `line.score` that `EnginePanel` shows as text.
- **No snapshot object-identity reuse.** The only consumer reads the whole document through one hook, so per-position identity would buy nothing yet. Add it when a component subscribes to a single position.
- **Crash guard.** After 5 consecutive lane crashes the analyzer stops scheduling, and positions stay `queued`. This was not in the sketch. It prevents a respawn loop when the worker bundle cannot load.
- **Deferred, not dropped:** move classification and accuracy (see open questions). `Ply` did not need a `uci` field, because nothing compares played moves yet.

## Open questions and risks

- Should analysis pause while the tab is hidden or the device is on battery? It currently runs until the game is complete.
- Are the level numbers right on low-end devices? They are calibrated on a fast desktop (1.7M nodes per second). On a phone at a third of that speed, Deep hits its 20 s time cap and stops being deterministic. Should Deep's node cap drop, or is that acceptable?
- Should move classification (best/mistake/blunder) and accuracy ship next? They follow from adjacent lines (Lichess win% curve), but our centipawn scale may run hotter than Stockfish's.
- Does the production build load the worker? This needs an `astro build && astro preview` check.

## Next implementation step

Move verdicts and accuracy as pure functions over adjacent `Line`s (`src/lib/analysis/review.ts`), shown as badges in `MoveList`. Before that, fit the win% curve's scale to PeSTO centipawns.
