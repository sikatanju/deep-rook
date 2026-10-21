import { useEffect, useEffectEvent, useState } from 'react';

import { parseHash } from '@/app/router';
import { useStore } from '@/app/store';
import type { Replay } from '@/lib/chess/replay';
import { openShare, readShareParams, ShareError } from '@/lib/share/link';

export type SharedLink =
  | { status: 'idle' }
  | { status: 'opening' }
  | { status: 'broken'; message: string };

const IDLE: SharedLink = { status: 'idle' };

function sourceOf({ headers }: Replay) {
  return headers.White && headers.Black
    ? `${headers.White} vs ${headers.Black}`
    : 'Shared game';
}

/**
 * Opens a review link (#/review?v=1&g=...) on load and on every hash change,
 * then swaps it for the clean route in place, so a refresh does not reopen it
 * and Back does not land on it again. Mount once, inside AppProvider.
 */
export function useSharedLink() {
  const { reviewReplay, settings } = useStore();
  const [link, setLink] = useState<SharedLink>(IDLE);

  const open = useEffectEvent((replay: Replay, side: 'w' | 'b') =>
    reviewReplay(replay, sourceOf(replay), side, settings.analysisLevel),
  );

  useEffect(() => {
    // Every hash change starts a new generation: a decode that finishes after
    // the user moved on, or after a newer link arrived, is dropped.
    let generation = 0;
    async function check() {
      const mine = ++generation;
      const { route, params } = parseHash(location.hash);
      const share = route === 'review' ? readShareParams(params) : null;
      if (!share) {
        setLink((l) => (l.status === 'opening' ? IDLE : l));
        return;
      }
      setLink({ status: 'opening' });
      const result = await openShare(share).catch((e: ShareError) => e);
      if (mine !== generation) return;
      // location.replace, not history.replaceState: it also fires hashchange,
      // which is how useRoute hears about the new route.
      if (result instanceof ShareError) {
        location.replace('#/games');
        setLink({ status: 'broken', message: result.message });
        return;
      }
      location.replace('#/review');
      open(result, share.side);
      setLink(IDLE);
    }
    void check();
    window.addEventListener('hashchange', check);
    return () => {
      generation = -1;
      window.removeEventListener('hashchange', check);
    };
  }, []);

  return { link, dismiss: () => setLink(IDLE) };
}
