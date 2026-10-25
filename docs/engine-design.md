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
<Board ... arrow={line?.pv[0]} second={line?.second?.pv[0]} />  // UCI, e.g. 'e2e4'; second is fainter
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
Line             = Variation & { depth; second?: Variation }
Variation        = { score: Score; pv: readonly string[] /* UCI */ }
Score            = { kind: 'cp'; cp } | { kind: 'mate'; winner: 'w' | 'b'; moves }  // White POV
```

`second` is the engine's next best line: the best line whose first move differs from `pv[0]`, searched to the same depth. It is never better for the side to move than the best line. It is absent when the root has fewer than two legal moves, and readers treat a missing second line as unknown.

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
| fast               | 8     | 500k     | 1 s      |
| balanced (default) | 12    | 1.5M     | 5 s      |
| deep               | 16    | 10M      | 20 s     |

Per position, iterative deepening runs to `depth` and stops at whichever cap binds first. Each iteration searches two lines (see Search), and both share the caps. A partial iteration is discarded, including one cut during its second line. The search also stops early on a proven mate. Key order is rank order, and a test asserts that every column strictly increases. Settings options, persisted-value validation, the scheduler, and the worker limits all derive from this table. The numbers are calibrated with `pnpm bench` (see Verification).

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
  - Quiescence over captures and queen promotions, with full evasions when in check, plus delta pruning. Captures with a negative SEE are skipped there unless the side is in check.
  - Move ordering: TT move, captures by MVV-LVA, promotions, two killers, butterfly history, then captures with a negative SEE (`see.ts`). SEE runs only when the capturer is worth more than the victim.
  - Non-PV nodes at depth ≤ 4 skip a losing capture once one move has been searched.
  - The PV comes from a triangular table.
  - MultiPV 2. After the first line of each depth, a second root search to the same depth skips the first line's move at ply 0, and its aspiration window centres on the previous iteration's second score. The restricted root is never stored in the transposition table, so the next iteration still finds the first line's move there. A root with one legal move gets no second search, since excluding that move would read as mate or stalemate. When search instability scores the second line above the first (18 of 304 iterations over the Opera Game at depth 10), the two swap, so the best line is always the higher one. The mate early stop reads the best line.
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
- **Reads go through `parseStored`.** A wrong `CACHE_VERSION`, an unknown level, a line count other than plies + 1, or a malformed line or replay is a miss, never a throw. Bump `CACHE_VERSION` whenever the engine, its evaluation, or the `Line` shape changes. Version 2 added the optional `second` line, which is validated like the first.
- **One database.** `idb.ts` opens the `deeprook` database (version 2) with an `analyses` store and a `drills` store, creating whichever is missing on upgrade, so a version 1 database keeps its reviews. An open connection closes itself when a newer tab upgrades.
- **Never breaks a review.** `openIdbStore()` is null without IndexedDB, and every IndexedDB failure resolves like a miss. `save` keeps the higher level, inside one transaction. Failed positions are never cached, so a game with one is not saved.
- **In the analyzer.** On a new game the analyzer marks it `loading` and plans nothing until the lookup settles, or until `CACHE_LOAD_MS` (1.5 s) passes so a hung database cannot stall analysis. A hit seeds each entry through `mergeLine` and `settle`, the same monotone writers the engine uses, so a late or repeated hit cannot make the document worse. A game is saved once every position has a line, none failed and all satisfy the current level, then again only after reaching a higher level.
- **Overview.** `summarize` grades a record with `classifyMoves` and `gameReport` and keeps the player's half. `overview` aggregates the games where a saved Chess.com or Lichess username matches a PGN name (`sideOf` takes the list, and a game where both sides match counts as nobody's), and lists the rest without counting them. The trend covers the latest 20 games. Grade mix, mistakes per stage, time trouble (see Clocks) and openings cover every saved game. Openings are named by position (`src/lib/chess/openings.ts`): the deepest position of the game found in the Lichess opening table (CC0, 3,865 lines, built into `openings.json` by `pnpm openings` at a pinned commit) gives the name, so a transposition, a Lichess game and a pasted PGN all agree. Only a game the table never reaches falls back to the PGN's `ECOUrl` or `Opening` header. The table is a separate 70 kB (gzipped) chunk that the Overview loads before it groups anything, and the service worker precaches it. The stage split in `src/lib/chess/stage.ts` is an approximation (endgame at six or fewer pieces besides pawns and kings, else opening until ply 20).

### Drills (`src/lib/analysis/drill.ts`)

The Drill route (`#/drill`) turns saved reviews into practice. `drillsOf` takes every mistake, miss and blunder the player made (from `mistakesOf`, the uncapped version of the report's key moments) in games where the saved username names their side. It asks for the move from the position before it, and drops any moment whose engine move is missing or illegal there.

- **Close enough counts.** A move solves the drill when it gives up less than `CLOSE_ENOUGH` (5) points of win chance against the saved line, the excellent and good bands. `judge` settles what the saved lines can: the engine's move, the move played in the game, and the second line's move. The second line is the best of the other moves, so when it falls short every other move does too and no search is needed. Any other move goes to the probe, the drill session waits in `checking`, and `judgeAfter` grades the searched position. Without an engine, such a move falls short. Show answer and Skip still work while the engine looks, and its late verdict is ignored.
- **Progress is kept** (`drill-progress.ts`, the `drills` store). Each answer moves the drill between Leitner boxes that rest it 0, 1, 3, 7, 21 or 60 days: a first-try solve moves it up a box, a solve after a wrong try drops it to box 1, a shown answer to box 0. A skip records nothing. `plan` puts due drills first, the most missed first, then drills never answered in queue order. Resting drills wait, and when nothing is due the page says when the next one comes back and offers to drill them anyway. The plan is read once per round, so the queue holds still while answers are saved. Clearing the saved reviews clears the progress too.
- `drill-session.ts` is the answer flow as a reducer.

### Clocks (`src/lib/chess/clock.ts`)

`moveClocks(replay)` turns the `%clk` readings and the `TimeControl` header into the time each move took and the time the mover had when it began. A reading is the time left after the move, increment included, so a move took the time before it plus the increment minus the time after. A side's first move gets no increment, which matches what both sites write. A game without a `base+increment` time control (daily games, pasted PGNs without the header) has no clocks. A missing reading leaves that move, and that side's next move, unknown.

A move is in **time trouble** when it began with less than a tenth of the starting time on the clock, or less than 10 seconds, whichever is more. The review draws time per move in a strip under the eval graph, on the same x axis, with moves in time trouble in red. The graph's tooltip adds the time. The coach says when a graded move began in time trouble, and how long a mistake, miss or blunder took otherwise. The Overview counts mistakes per 100 moves with time on the clock and in time trouble, over the games that have clocks.

### Annotated PGN (`src/lib/analysis/export-pgn.ts`)

`annotatedPgn(replay, analysis)` is pure over one analysis snapshot. It grades with `classifyMoves` and `gameReport` itself, so the file agrees with the screen.

- **Per move.** `{[%eval 0.35] [%clk 0:04:58] Blunder. Best was dxe5.}` after the move, with a numeric glyph before it for brilliant (`$3`), great (`$1`), inaccuracy (`$6`), mistake (`$2`) and blunder (`$4`). Miss has no glyph. Best, excellent and good carry only the eval. The eval is the position after the move, from White's view, in pawns. Mate is `#n` for White and `#-n` for Black, and mate on the board gets none.
- **Unsettled positions** get no eval and so no grade. The button in the review page is disabled until `analysis.done` equals the position count, so a download is complete unless the engine failed on a position.
- **Lead comment.** The level and each side's estimated accuracy, before move 1.
- **Headers.** The seven tag roster first, `?` where missing, then the rest in their original order, then `Annotator "DeepRook"`. `SetUp` and `FEN` are rewritten from the replay's start.
- **Wrapping.** Lines break between tokens at 80 columns and a comment is one token, so no `[%eval` is split from its value.
- **Not verified.** Only a chess.js round trip and the app test check the output. Nobody has imported it into Lichess or ChessBase, so how they render the glyphs and sentences is a guess.

### Side lines and the last review

**Side lines.** The review board takes clicks. A move the game did not play opens a `Branch` (`src/lib/chess/branch.ts`): the game position it leaves (`base`, a viewer index), the plies played, and `at`, how many are on the board, so stepping back keeps the rest to step forward into. Playing the game's own next move just advances the game. Playing the next move already in the line steps forward and keeps the tail. Any other move cuts the tail. Any navigation of the game itself (move list, graph, `goTo`) drops the branch. The step keys and buttons walk the branch while one exists, and Escape or "Back to the game" leaves it. The game's analysis keeps focus on `base`.

Positions on a branch are not game positions, so the analyzer does not search them. `createProbe` (`src/lib/analysis/probe.ts`) is a one-lane analyzer for them, reached through `useProbe`. It searches at the review's level after a 150 ms dwell, cancels by terminating the lane when asked about another position, and remembers every finished position by FEN, so stepping through a line costs nothing. A level change forgets its lines. The search input (position plus history back to the last irreversible move) comes from `searchInputAt`, shared with the analyzer. The probe costs one extra worker beside the analyzer's pool.

A side move is graded by `gradeSideMove`: the engine's move is best, anything else takes the loss band of `classifyMoves`. Great, brilliant and miss are never given because they depend on the game around the move. The grade needs a settled line on both sides of the move: the game's line at `base` for the first move, the probe's remembered line for later ones. A move stepped past too quickly to be searched has no grade. The engine line under the coach is the current position's principal variation, up to 8 plies, and each move plays the line out to itself. The coach's "Best was" row carries "Try it", which rewinds to the position before the graded move and plays the engine's.

**Last review.** `src/app/last-review.ts` keeps the game under review in `localStorage` (`lastReview`: version, replay, source, side, level), written whenever the loaded game changes and read once, synchronously, when the store mounts, so a refresh never flashes the empty review page. It stores the game, not its analysis. That is already in the saved reviews, or is searched again. `parseLastReview` is the boundary: a wrong version, an unknown level, a bad side or a damaged replay is no review, never a throw. The side line being explored is not restored.

### Sources and links

**Lichess.** `GET /api/games/user/{name}` with `Accept: application/x-ndjson` and `pgnInJson=true` returns one game per line, newest first. `Accept` is a CORS-safelisted header and the response allows any origin, so no preflight and no server. Lichess answers 404 to crawler-looking User-Agents, which real browsers are not, but headless Chrome is. `parse.ts` keeps standard games with two named players and drops variants, aborted games and engine opponents. Pages count dropped lines too, so a page of variants does not look like the end of the history. `until` is the oldest `createdAt` seen. A 429 waits a minute once, as Lichess asks. The opening table names Lichess games the same way as Chess.com ones. `openingName`, the fallback for games the table never reaches, reads the `Opening` header, which Lichess writes in a different style than Chess.com's slug.

**Share links.** `encodeReplay` writes the replay as a compact PGN (an allowlist of headers, SAN moves, `%clk` comments, `SetUp`/`FEN` for custom starts), deflates it and writes base64url. `decodeReplay` is the boundary for untrusted input. It caps the inflated size while streaming, rejects unknown versions and bad bytes, and sends the text through `parseReplay`. The receiving hook opens the game, then replaces the hash with `#/review` so a refresh or Back does not reopen it. A refresh after that reopens the game from the last-review record (see Side lines and the last review).

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
src/lib/analysis/idb.ts          openIdb: the one IndexedDB database and its stores
src/lib/analysis/cache.ts        gameKey, parseStored, openIdbStore, memoryStore
src/lib/analysis/inputs.ts       searchInputAt: a position plus its repetition history
src/lib/analysis/probe.ts        createProbe: one lane for positions outside the game
src/lib/analysis/overview.ts     summarize, overview (pure, over saved records)
src/lib/analysis/export-pgn.ts   annotatedPgn, pgnFilename (pure, over one analysis)
src/lib/analysis/drill.ts        drillsOf, drillQueue, judge, judgeAfter (pure, over saved records)
src/lib/analysis/drill-session.ts  step: the drill answer flow as a reducer
src/lib/analysis/drill-progress.ts  advance, plan (pure); openIdbProgress, memoryProgress
src/lib/chess/clock.ts           moveClocks, parseTimeControl, formatSpent (pure)
src/lib/chess/openings.ts        openingOf, loadOpeningBook (openings.json from pnpm openings)
src/lib/chess/play.ts            legal targets and typed moves, for the drill and review boards
src/lib/chess/branch.ts          Branch: a side line played out of the game (pure)
src/lib/chess/stage.ts           Stage, stageAt
src/workers/engine.worker.ts     thin shell around createEngine
src/hooks/use-game-analysis.tsx  AnalysisProvider, useGameAnalysis, useAnalysisStore, useDrillProgress, useProbe  <- the UI's only door
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
- We accept a first-light pass at `fast` (about 5% of Deep's node budget) in exchange for a whole-game picture within seconds.
- We accept up to 8 workers × about 10 MiB in exchange for using the user's cores.
- We accept that a time cap makes a result machine-dependent on slow devices. It's reported as `reason: 'time'`, and `Line.depth` shows what was reached.
- We accept about one ply less at each level's node cap in exchange for a second line per position, which grades only-moves and names the next best move in the coach.
- We accept a PeSTO-only evaluation, with no tuner, in exchange for a known-good baseline. _ponytail: add a Texel tuner when `pnpm match` justifies it._
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
  - determinism (same request gives the same line, second line included, and node count)
  - the node cap binding with the kept iteration's second line intact, and iterations streaming in order
  - on six positions, a second line that starts with another move and is never better for the mover, including one where search instability makes the lines swap
  - no second line when the root has one legal move (Nxb8 after 16. Qb8+)
  - 14. Rd1 in the Opera Game as an only-move, 3+ pawns ahead of the next best
  - a plain recapture staying `best` however far behind the next best is
- **SEE** (`see.test.ts`): free pawn, pawn defended by pawn, equal trade, x-rays on both sides, a king that cannot recapture into an attack, and en passant. Each test also asserts the board is restored.
- **Strength** (`pnpm match`): the working tree against a git ref, or a directory holding a `src/` tree, at a fixed node count per move. Openings are seeded random 8-ply lines a shallow search calls level, and each is played with both colours. It prints W/D/L and an Elo difference with a 95% interval, so a search change is kept only when the interval clears zero. Self against self gives 0 Elo. SEE, 800 games each at 20k nodes per move, each step against the one before: ordering losing captures last +31 [9, 53] against the previous HEAD, skipping them in quiescence +66 [44, 89] against it, pruning them at shallow non-PV nodes another +37 [15, 59]. SEE costs about 5% in nodes per second (1.55M against 1.65M on `pnpm bench`), and Fast reaches depth 8 with 32% fewer nodes. Fixed nodes ignore that cost, so the gain in time is smaller than the gain in nodes.
- **Scheduling and analyzer** (`schedule.test.ts`, `analyzer.test.ts`): the plan's priority order, the dwell-gated preemption, and no duplicate or redone work. Also streaming into the document, stale messages after a game switch, raising and lowering the level, monotone lines, history FENs in jobs, and the no-Worker case. These use scripted lanes and fake timers.
- **App** (`analysis.test.tsx`): an in-process `Worker` stub runs the real engine through the real analyzer, hook, panel, and arrow. On Opera position 30 it shows `#2`, `Qb8+ Nxb8 Rd8#`, a b3→b8 arrow and a fainter second arrow. After 17. Rd8#, the engine's own move, the coach names the next best move and no "Best was". The level setting persists across a remount. `staging.test.tsx` counts the stub's jobs: staging posts none, and Review game posts some.
- **Bench** (`pnpm bench`): 8 fixed positions on the engine bundled the way the worker ships. Measured on a 12-thread dev machine at about 1.4M (fast) to 1.85M (deep) nodes per second per core, 3 runs each, with MultiPV 2:

  | Level    | Per position (avg) | Typical middlegame depth | Bound that binds         |
  | -------- | ------------------ | ------------------------ | ------------------------ |
  | fast     | ~0.16 s            | 8                        | depth                    |
  | balanced | ~0.8 s             | 9–11                     | nodes; depth in endgames |
  | deep     | ~5 s               | 13–14                    | nodes; depth in endgames |

  The time caps never bound on this machine, so results here are deterministic: node totals and depths were identical across runs. A machine about 3× slower reaches the Deep time cap.

  The second line costs about 2× the nodes per depth: 7.43M to 15.37M over 37 positions searched to depth 9, and 1.9× to 2.5× at depths 4 to 11 on the bench positions. At unchanged node caps that is about one ply. Before MultiPV, the same positions reached depth 8 at fast, 10 to 12 at balanced and 13 to 16 at deep. Fast's cap went from 250k to 500k to get depth 8 back on every bench position, at about 1.3 s for all eight. Wall time per level rose 20% to 50%, because fewer positions now finish early on the depth cap, and nodes per second fell about 6%. With the second search switched off, the code searches the identical tree at the old rate, so the slowdown comes from the second search's tree and not from per-node overhead. Balanced and Deep keep their caps: doubling them would double review time and push Deep further past its time cap on slow devices.

- **Real artifacts**:
  - `astro build` emits `engine.worker-*.js` as a self-contained IIFE. Run under Node with a fake `self`, the bundle streams 9 lines and returns `done` at depth 8.
  - The dev server serves the worker module.
  - It was not driven in a real browser in this session (no browser tool was available).

## Implementation reconciliation

The orchestrator accepted every deviation below against this design.

- **Fast node cap 150k → 250k → 500k.** The bench showed Fast reaching only depth 7 in middlegames at 150k, and the second line of MultiPV cost another one to two plies at 250k. Contract unchanged: it's a table value.
- **Bench is a script, not a Vitest test.** Vitest's module transform turns imported constants into property lookups in the hot loop: 0.3M vs 1.7M nodes per second measured. `scripts/bench.mjs` bundles with Vite first. This is a local deviation with no contract impact.
- **Engine tests run in jsdom, not the node environment.** The shared `vitest.setup.ts` touches `localStorage`. This is local.
- **EvalBar is a vertical bar beside the board, as sketched in Usage.** It first shipped as a horizontal win-chance meter inside `EnginePanel`, because a vertical bar would have entangled the board column's resize logic. The full-height review layout made the board column a grid, and the bar now has its own track beside the board. It reads the same `line.score` that `EnginePanel` shows as text.
- **No snapshot object-identity reuse.** The only consumer reads the whole document through one hook, so per-position identity would buy nothing yet. Add it when a component subscribes to a single position.
- **Crash guard.** After 5 consecutive lane crashes the analyzer stops scheduling, and positions stay `queued`. This was not in the sketch. It prevents a respawn loop when the worker bundle cannot load.
- **Win% curve kept at Lichess's constant (0.00368208).** `scripts/winfit-human.mjs` replayed 342 analysed Lichess games (rated blitz and rapid, players around 1400) and scored 6,024 positions with our engine at Balanced-like limits. The logistic constant that best predicts the real results from our centipawns is 0.0036 (90% interval 0.0028 to 0.0048), and the log loss with Lichess's constant matches the fitted one to four decimals. So the data gives no reason to change it. Two caveats stand. The sample is one rating band, and Lichess's own evals fit these results at 0.0026 (0.0022 to 0.0032), flatter than its published constant. Our centipawns also run about half the size of Lichess's on the same positions (median ratio 0.47), and that does not reconcile with the equal constants. A shallower search missing tactics is the untested guess. Rerun the script after any change that moves the evaluation scale, a Texel tuner included.
- **Deferred, then shipped:** move classification (`classify.ts`) and accuracy (`report.ts`). `Ply` did not need a `uci` field, because grades compare the played squares to the engine's first move (`isPlayed`).

## Open questions and risks

- Should analysis pause while the tab is hidden or the device is on battery? It currently runs until the game is complete.
- Are the level numbers right on low-end devices? They are calibrated on a fast desktop (1.7M nodes per second). On a phone at a third of that speed, Deep hits its 20 s time cap and stops being deterministic. Should Deep's node cap drop, or is that acceptable?

## Next implementation step

None is open here. The engine item still open is a Texel tuner (see the evaluation decision above). The risks above are the other open work.
