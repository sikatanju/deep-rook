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
- `src/layouts/main.astro` has an inline script that sets the `dark` class on `<html>` before first paint. `ThemeProvider` reads that class as its source of truth and persists the choice in `localStorage` under `theme`.
- All UI and state live under `src/app` and `src/components`. shadcn/ui (Radix, `radix-nova`, neutral) generates into `src/components/ui`.
- No client router yet. `App` is the single root, so a router can wrap it later without moving files.
- The chess engine is written from scratch in `src/lib/engine` and runs in a pool of Web Workers (`src/workers`) on the user's machine. `src/lib/analysis` schedules it across a game. UI code reads it only through `useGameAnalysis`; a lint rule enforces that. Design: `docs/engine-design.md`.
- Anything prefixed `PUBLIC_` is exposed to the browser. Keep secrets out.
