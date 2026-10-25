# DeepRook

Client-side chess analysis. A static site with one client-rendered React app. No server, no SSR, no adapter.

## Setup

Needs Node >=22.12 (`nvm use`) and pnpm.

```sh
pnpm install
pnpm dev
```

## Scripts

| Script                      | Does                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| `dev` / `build` / `preview` | Astro dev server, static build to `dist/`, preview of the build   |
| `check`                     | `astro check` (types for `.ts`, `.tsx`, `.astro`)                 |
| `lint` / `format`           | ESLint (flat config) / Prettier                                   |
| `test`                      | Vitest + Testing Library on jsdom                                 |
| `bench`                     | Engine nodes/s and depth per analysis level (bundled, not Vitest) |
| `match`                     | Engine strength: working tree vs a git ref, W/D/L and Elo         |

## Install and offline

DeepRook is an installable web app. In Chrome or Edge use Install (desktop) or Add to Home screen (Android). In Safari on iOS use Share, then Add to Home Screen. After one visit with a network it opens with none.

- Offline, everything works except fetching games from Chess.com or Lichess. Pasting a PGN, the Opera Game, reviews (the engine runs in a local worker), saved reviews, the Overview and Drills all work.
- `src/sw/sw.js` is the service worker template. On `astro build`, the integration in `src/sw/precache.ts` lists every emitted file, hashes them into a cache version and writes `dist/sw.js`. The worker precaches that list and serves it cache first. It never touches cross-origin requests, so the game APIs always go to the network. The layout registers it in production builds only. In `astro dev`, `/sw.js` is a stub that unregisters a worker left behind by `astro preview` on the same port.
- Updates. A deploy changes the version. The browser installs the new worker in the background on the next visit, but it waits until every DeepRook tab is closed, so an open tab keeps the files it loaded. The next launch runs the new version and deletes the old cache. `public/_headers` makes Cloudflare revalidate `sw.js` and the manifest on every request.
- Icons. The sources are `scripts/icons/icon.svg` (rounded tile) and `scripts/icons/maskable.svg` (full bleed, rook inside the 80% safe zone, also used for the iOS icon). `node scripts/icons.mjs` renders the PNGs in `public/` with sharp, which comes in through Astro. The manifest colours are Pop Quiz `--ground` (background) and `--primary` (theme).

## Architecture

- Astro is the HTML shell and build tool only (`output: 'static'`, no adapter). Tailwind 4 comes in through `@tailwindcss/vite`, CSS-first, no `tailwind.config.js`.
- `src/pages/index.astro` mounts `<App client:only="react" />`, so React never renders on the server. `dist/index.html` holds only the loading fallback.
- `src/layouts/main.astro` has an inline script that sets `data-theme` on `<html>` from the saved `settings.palette` before first paint, so the page never flashes the default palette. `AppProvider` keeps it in step when the palette changes.
- All UI and state live under `src/app` and `src/components`. shadcn/ui (Radix, `radix-nova`) generates into `src/components/ui`, restyled to the design system below.
- Routing is a hash router (`src/app/router.ts`): `#/games`, `#/overview`, `#/drill`, `#/review`, `#/settings`. `App` is the single root.
- The chess engine is written from scratch in `src/lib/engine` and runs in a pool of Web Workers (`src/workers`) on the user's machine. `src/lib/analysis` schedules it across a game. UI code reads it only through `useGameAnalysis`; a lint rule enforces that. Design: `docs/engine-design.md`.
- The review board takes clicks: move a piece to play a side line out of any position, and the coach grades the move and shows the engine's line, each move of which plays out on the board. Side positions are searched by a separate one-lane probe (`src/lib/analysis/probe.ts`, `useProbe`). The game under review is kept in `localStorage` (`src/app/last-review.ts`), so a refresh reopens it. Details: `docs/engine-design.md`, Side lines and the last review.
- Finished analyses are saved in IndexedDB, one record per game keyed by its positions, so a refresh or a reopened game skips the engine. The Overview route (`#/overview`) reads them to show accuracy over time, the grade mix, mistakes by game stage and the openings that cost the most. Openings are named from the moves with the Lichess opening table, so games from any source group together. It matches games to you by the Chess.com and Lichess usernames saved on the Games page. Settings can clear the saved reviews. Details: `docs/engine-design.md`, Persistence.
- The Games page can review your latest 5, 10 or 20 listed games in one go (`src/lib/analysis/batch.ts`). The batch skips games already saved at the chosen mode, saves each game as it finishes, keeps going on other pages, and pauses while a review you opened is still being analyzed. Saved games carry a "Reviewed" mark in the list. Details: `docs/engine-design.md`, Batch analysis.
- Clock readings (`%clk`) give the time each move took (`src/lib/chess/clock.ts`). The review shows time per move under the eval graph and says when a move began in time trouble, and the Overview compares your mistake rate with time on the clock and in time trouble. Details: `docs/engine-design.md`, Clocks.
- The Drill route (`#/drill`) turns your own mistakes, misses and blunders from those saved reviews into puzzles: the position before the move, where you click or type the engine's move or one nearly as good (the engine checks moves the saved analysis cannot settle). Answers are saved: a missed drill comes back next time, a solved one rests for days and then returns. Details: `docs/engine-design.md`, Drills.
- The Games page lists games from Chess.com (by month) or Lichess (newest first, 'Load older games'). `src/lib/lichess` mirrors `src/lib/chesscom`: `parse.ts` is the only code that reads Lichess's NDJSON shape and both clients produce the same `Game`. Lichess sends `access-control-allow-origin`, so the browser calls it directly with no server. Each site remembers its own username.
- A review can be shared as a link, `#/review?v=1&g=<payload>&side=w|b`. `src/lib/share` rebuilds a compact PGN from the replay, deflates it with the native `CompressionStream` and writes base64url, about 340 characters for the Opera Game. The link carries the game and not the analysis, so the recipient's own engine recomputes it. Decoding is capped at 64 KiB and every failure is a `ShareError`. The router reads the route name before the `?`.
- A finished review can be downloaded as an annotated PGN (the download button beside Copy link). `src/lib/analysis/export-pgn.ts` writes an `[%eval]` and the clock after every move, a numeric glyph and a sentence on brilliant, great, inaccuracy, mistake, miss and blunder moves, and the engine's move where yours was worse. Lichess reads the evals and clocks on import. Other tools show the glyphs and sentences. The button stays disabled until every position has settled.
- Anything prefixed `PUBLIC_` is exposed to the browser. Keep secrets out.

## Design system

The look is the DeepRook neo-brutal system: 3px borders, hard offset shadows (zero blur), press-to-sink buttons, Bricolage Grotesque and Space Mono.

- Tokens live in `src/styles/global.css`, generated from the system's `tokens.json`. Pop Quiz is on `:root`; the other seven palettes are `[data-theme="<id>"]` blocks. `@theme inline` exposes them as utilities (`bg-primary`, `bg-surface`, `text-ink`, `border-line`, `shadow-md`, `bg-grade-blunder`). `src/styles/tokens.test.ts` keeps the eight blocks declaring the same variables.
- Palette ids are listed in `src/lib/palettes.ts`. The choice is a setting (`settings.palette`) and the Settings page switches it. Arcade Night is the dark palette.
- Never hard-code black for a border or shadow: use `border-line` and the `shadow-*` utilities, which follow the palette. Text on any coloured fill is `text-sticker-ink`.
- Fonts are self-hosted with Fontsource, so the app keeps working offline.
