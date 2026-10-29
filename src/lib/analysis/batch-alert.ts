// Tells the player a batch is done when they are not looking: a badge in the
// tab title, and a system notification if they allowed one. Progress shows in
// the title while it runs.

import type { Alert } from '@/lib/notify';

import { isActive, type Batch, type BatchSnapshot } from './batch';

/** Progress while running, the done badge until the tab is looked at, else the plain name. */
export function tabTitle(
  base: string,
  batch: BatchSnapshot,
  badge: number | null,
): string {
  if (isActive(batch)) return `(${batch.finished}/${batch.total}) ${base}`;
  return badge === null ? base : `(✓ ${badge}) ${base}`;
}

export function doneAlert(saved: number): Alert {
  return {
    title: 'Your reviews are ready',
    body: `${saved} ${saved === 1 ? 'game is' : 'games are'} reviewed and saved. Open your progress.`,
    hash: '#/overview',
  };
}

/**
 * Keeps `doc.title` in step with the batch. Only a batch seen running that
 * ends with games saved, while the tab is hidden, earns the badge and the
 * notification. A cancelled batch, one that saved nothing, and one that ends
 * in front of the player need neither.
 */
export function watchBatch({
  batch,
  doc,
  notify,
}: {
  batch: Pick<Batch, 'subscribe' | 'getSnapshot'>;
  doc: Pick<
    Document,
    'title' | 'visibilityState' | 'addEventListener' | 'removeEventListener'
  >;
  notify: (alert: Alert) => void;
}): () => void {
  const base = doc.title;
  let badge: number | null = null;
  let running = isActive(batch.getSnapshot());

  const render = () => {
    doc.title = tabTitle(base, batch.getSnapshot(), badge);
  };

  const onBatch = () => {
    const now = batch.getSnapshot();
    if (isActive(now)) badge = null;
    else if (running && now.phase === 'finished') {
      const saved = now.finished - now.failed;
      if (saved > 0 && doc.visibilityState === 'hidden') {
        badge = saved;
        notify(doneAlert(saved));
      }
    }
    running = isActive(now);
    render();
  };

  const onVisible = () => {
    if (doc.visibilityState !== 'visible' || badge === null) return;
    badge = null;
    render();
  };

  doc.addEventListener('visibilitychange', onVisible);
  const unsubscribe = batch.subscribe(onBatch);
  render();
  return () => {
    unsubscribe();
    doc.removeEventListener('visibilitychange', onVisible);
    doc.title = base;
  };
}
