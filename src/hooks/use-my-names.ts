import { useMemo } from 'react';

import { useStore } from '@/app/store';
import { readSavedUsernames } from '@/components/game-picker/username-form';

/**
 * Every name that makes a game the player's own: the saved Chess.com and
 * Lichess usernames plus the extra names from settings. Hand the list to
 * `sideOf`. It follows the extra names as they are added or removed.
 */
export function useMyNames(): string[] {
  const { extraNames } = useStore().settings;
  return useMemo(() => [...readSavedUsernames(), ...extraNames], [extraNames]);
}
