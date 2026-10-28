import { useCallback } from 'react';

import { useStore } from '@/app/store';
import { play, type Sound } from '@/lib/sound';

/** `play`, silent when the Sound setting is off. Stable while the setting holds. */
export function useSound() {
  const { sound } = useStore().settings;
  return useCallback((s: Sound) => sound && play(s), [sound]);
}
