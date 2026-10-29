import { expect, test, vi } from 'vitest';

import type { BatchSnapshot } from './batch';
import { doneAlert, tabTitle, watchBatch } from './batch-alert';

const counts = { level: 'fast', total: 10, finished: 3, failed: 0 } as const;
const current = { id: 'g', label: 'a vs b', done: 0, positions: 20 };
const running: BatchSnapshot = { phase: 'running', ...counts, current };
const finished = (finished: number, failed = 0): BatchSnapshot => ({
  phase: 'finished',
  ...counts,
  finished,
  failed,
});

function setup(initial: BatchSnapshot = { phase: 'idle' }) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const batch = {
    getSnapshot: () => snapshot,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const doc = Object.assign(new EventTarget(), {
    title: 'DeepRook',
    visibilityState: 'visible' as 'visible' | 'hidden',
  });
  const notify = vi.fn();
  const stop = watchBatch({ batch, doc, notify });
  return {
    doc,
    notify,
    stop,
    move: (next: BatchSnapshot) => {
      snapshot = next;
      listeners.forEach((l) => l());
    },
    show: (state: 'visible' | 'hidden') => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

test('the title shows how many games are behind the batch while it runs', () => {
  const { doc, move } = setup();
  expect(doc.title).toBe('DeepRook');
  move(running);
  expect(doc.title).toBe('(3/10) DeepRook');
  move({ ...running, finished: 4 });
  expect(doc.title).toBe('(4/10) DeepRook');
});

test('finishing while the tab is hidden badges the title and sends one notification', () => {
  const { doc, move, show, notify } = setup();
  move(running);
  show('hidden');
  move(finished(10));

  expect(doc.title).toBe('(✓ 10) DeepRook');
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(doneAlert(10));
  expect(doneAlert(10).hash).toBe('#/overview');
});

test('the badge counts the games saved, not the ones that failed', () => {
  const { doc, move, show } = setup();
  move(running);
  show('hidden');
  move(finished(10, 3));
  expect(doc.title).toBe('(✓ 7) DeepRook');
});

test('the badge clears when the player comes back, and does not return', () => {
  const { doc, move, show } = setup();
  move(running);
  show('hidden');
  move(finished(10));
  show('visible');
  expect(doc.title).toBe('DeepRook');
  show('hidden');
  show('visible');
  expect(doc.title).toBe('DeepRook');
});

test('finishing in front of the player needs no badge and no notification', () => {
  const { doc, move, notify } = setup();
  move(running);
  move(finished(10));
  expect(doc.title).toBe('DeepRook');
  expect(notify).not.toHaveBeenCalled();
});

test('a cancelled batch, and one that saved nothing, announce nothing', () => {
  const { doc, move, show, notify } = setup();
  move(running);
  show('hidden');
  move({ phase: 'cancelled', ...counts });
  expect(doc.title).toBe('DeepRook');

  move(running);
  move(finished(10, 10));
  expect(doc.title).toBe('DeepRook');
  expect(notify).not.toHaveBeenCalled();
});

test('a batch already over when the watcher starts is not announced', () => {
  const { doc, notify } = setup(finished(10));
  expect(doc.title).toBe('DeepRook');
  expect(notify).not.toHaveBeenCalled();
});

test('a new batch drops the old badge', () => {
  const { doc, move, show } = setup();
  move(running);
  show('hidden');
  move(finished(10));
  move(running);
  expect(doc.title).toBe('(3/10) DeepRook');
});

test('stopping restores the title and stops listening', () => {
  const { doc, move, show, stop, notify } = setup();
  move(running);
  stop();
  expect(doc.title).toBe('DeepRook');
  show('hidden');
  move(finished(10));
  expect(doc.title).toBe('DeepRook');
  expect(notify).not.toHaveBeenCalled();
});

test('tabTitle is the plain name when nothing is running and nothing is waiting', () => {
  expect(tabTitle('DeepRook', { phase: 'idle' }, null)).toBe('DeepRook');
});
