import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { expect, test, vi } from 'vitest';

import { memoryStore } from '@/lib/analysis/cache';
import { memoryProgress } from '@/lib/analysis/drill-progress';
import { OPERA_SLIPS, stored } from '@/lib/analysis/fixtures';
import type { Job } from '@/lib/analysis/protocol';
import { fenAt } from '@/lib/chess/replay';

// A scripted engine: every search answers with White's centipawns from
// `engine.scores` for its position, 0 when unlisted, after `engine.delay` ms.
const engine = vi.hoisted(() => {
  const state = { scores: new Map<string, number>(), delay: 0 };
  class ScriptedWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    private dead = false;
    postMessage({ jobId, fen }: Job) {
      setTimeout(() => {
        if (this.dead) return;
        const line = {
          score: { kind: 'cp', cp: state.scores.get(fen) ?? 0 },
          pv: [],
          depth: 1,
        };
        this.onmessage?.({
          data: { kind: 'done', jobId, outcome: { line } },
        });
      }, state.delay);
    }
    terminate() {
      this.dead = true;
    }
  }
  globalThis.Worker = ScriptedWorker as never;
  return state;
});

import App from './App';

const record = stored({ ...OPERA_SLIPS, level: 'fast' });
/** The 4... Bxf3 drill's position, where the saved line has White at 0.0. */
const puzzle = fenAt(record.replay, 7);
const after = (move: string) => new Chess(puzzle).move(move).after;

async function openDrill() {
  const store = memoryStore();
  await store.save(record);
  localStorage.setItem('lastUsername', 'Duke Karl / Count Isouard');
  location.hash = '#/drill';
  render(<App store={store} progress={memoryProgress()} />);
  const user = userEvent.setup();
  await screen.findByText('Drill 1 of 2');
  return user;
}

const square = (name: RegExp) => screen.getByRole('button', { name });
const piece = (at: string) =>
  document
    .querySelector(`[data-square="${at}"] [data-piece]`)
    ?.getAttribute('data-piece') ?? null;

test('a move the engine finds nearly as good solves the drill', async () => {
  engine.scores = new Map([[after('Nf6'), 30]]);
  engine.delay = 0;
  const user = await openDrill();

  await user.click(square(/^g8/));
  await user.click(square(/^f6/));
  expect(screen.getByText('Checking that move…')).toBeInTheDocument();
  expect(screen.getByText('The engine is looking at Nf6.')).toBeInTheDocument();
  expect(piece('f6')).toBe('bN');

  expect(await screen.findByText('Close enough.')).toBeInTheDocument();
  expect(
    screen.getByText(
      /^Nf6 is nearly as good as the engine's dxe5\. You played Bxf3/,
    ),
  ).toBeInTheDocument();
  // Back on the puzzle, with the engine's move drawn.
  expect(piece('f6')).toBeNull();
  expect(document.querySelector('[data-arrow="d6e5"]')).not.toBeNull();
});

test('a searched move that falls short says what it gives up', async () => {
  engine.scores = new Map([[after('Nd7'), 200]]);
  engine.delay = 0;
  const user = await openDrill();

  await user.click(square(/^b8/));
  await user.click(square(/^d7/));
  expect(
    await screen.findByText("Not the engine's first choice."),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Nd7 gives up 17.6 points of winning chances. The engine's move, or one nearly as good, solves it.",
    ),
  ).toBeInTheDocument();
  expect(piece('d7')).toBeNull();

  await user.click(square(/^d6/));
  await user.click(square(/^e5/));
  expect(screen.getByText('You found it.')).toBeInTheDocument();
});

test('Show answer while the engine looks wins over its verdict', async () => {
  engine.scores = new Map([[after('Nf6'), 30]]);
  engine.delay = 300;
  const user = await openDrill();

  await user.click(square(/^g8/));
  await user.click(square(/^f6/));
  expect(screen.getByText('Checking that move…')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText("Here is the engine's move.")).toBeInTheDocument();

  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(screen.getByText("Here is the engine's move.")).toBeInTheDocument();
  expect(screen.queryByText('Close enough.')).toBeNull();
});
