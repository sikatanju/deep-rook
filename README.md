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

## Architecture

- Astro is the HTML shell and build tool only (`output: 'static'`, no adapter). Tailwind 4 comes in through `@tailwindcss/vite`, CSS-first, no `tailwind.config.js`.
- `src/pages/index.astro` mounts `<App client:only="react" />`, so React never renders on the server. `dist/index.html` holds only the loading fallback.
- `src/layouts/main.astro` has an inline script that sets `data-theme` on `<html>` from the saved `settings.palette` before first paint, so the page never flashes the default palette. `AppProvider` keeps it in step when the palette changes.
- All UI and state live under `src/app` and `src/components`. shadcn/ui (Radix, `radix-nova`) generates into `src/components/ui`, restyled to the design system below.
- No client router yet. `App` is the single root, so a router can wrap it later without moving files.
- The chess engine is written from scratch in `src/lib/engine` and runs in a pool of Web Workers (`src/workers`) on the user's machine. `src/lib/analysis` schedules it across a game. UI code reads it only through `useGameAnalysis`; a lint rule enforces that. Design: `docs/engine-design.md`.
- Anything prefixed `PUBLIC_` is exposed to the browser. Keep secrets out.

## Design system

The look is the DeepRook neo-brutal system: 3px borders, hard offset shadows (zero blur), press-to-sink buttons, Bricolage Grotesque and Space Mono.

- Tokens live in `src/styles/global.css`, generated from the system's `tokens.json`. Pop Quiz is on `:root`; the other seven palettes are `[data-theme="<id>"]` blocks. `@theme inline` exposes them as utilities (`bg-primary`, `bg-surface`, `text-ink`, `border-line`, `shadow-md`, `bg-grade-blunder`). `src/styles/tokens.test.ts` keeps the eight blocks declaring the same variables.
- Palette ids are listed in `src/lib/palettes.ts`. The choice is a setting (`settings.palette`) and the nav rail and Settings page both switch it. Arcade Night is the dark palette.
- Never hard-code black for a border or shadow: use `border-line` and the `shadow-*` utilities, which follow the palette. Text on any coloured fill is `text-sticker-ink`.
- Fonts are self-hosted with Fontsource, so the app keeps working offline.
