import { useCallback, useEffect, useRef, useState } from 'react';

import {
  readSavedUsername,
  SAVED_SITES,
} from '@/components/game-picker/username-form';
import {
  checkNewGames,
  markSeen,
  summarize,
  type NewGames,
  type SiteCheck,
} from '@/lib/new-games';

export type FoundGames = NewGames & {
  /** When the check ran, in ms; what the games count as seen up to. */
  checkedAt: number;
};

/**
 * The player's games since they last looked, found once when the app opens:
 * each saved username's recent games are fetched in the background, silently
 * (offline, or on an error, nothing is found). `found` stays until `seen`
 * marks the games read or `dismiss` also drops them.
 */
export function useNewGames() {
  const [state, setState] = useState<{
    checks: SiteCheck[];
    checkedAt: number;
  } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Once per open, however often this effect runs.
    if (started.current) return;
    started.current = true;
    const names = SAVED_SITES.map((site) => ({
      site,
      username: readSavedUsername(site),
    })).filter((n) => n.username);
    if (names.length === 0 || navigator.onLine === false) return;
    const now = Date.now();
    void checkNewGames({ names, now }).then((checks) => {
      if (checks.length > 0) setState({ checks, checkedAt: now });
    });
  }, []);

  const found: FoundGames | null = state && {
    ...summarize(state.checks)!,
    checkedAt: state.checkedAt,
  };

  /** Marks the games seen, so a later visit does not offer them again. */
  const seen = useCallback(() => {
    if (state) markSeen(state.checks, state.checkedAt);
  }, [state]);

  const dismiss = useCallback(() => {
    seen();
    setState(null);
  }, [seen]);

  return { found, seen, dismiss };
}
