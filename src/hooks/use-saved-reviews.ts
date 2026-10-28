import { useCallback, useEffect, useState } from 'react';

import { useAnalysisStore, useDrillProgress } from '@/hooks/use-game-analysis';
import type { StoredAnalysis } from '@/lib/analysis/cache';
import { clearStreak } from '@/lib/analysis/drill-streak';

/**
 * The reviews saved in this browser, newest first, read again after every
 * save, so a review finishing anywhere shows up. `records` is null until the
 * first read finishes, and stays [] when nothing can be saved here.
 */
export function useSavedReviews() {
  const store = useAnalysisStore();
  const progress = useDrillProgress();
  const [records, setRecords] = useState<StoredAnalysis[] | null>(
    store ? null : [],
  );

  useEffect(() => {
    if (!store) return;
    // Only the latest read lands: reads can settle out of order.
    let latest = 0;
    let current = true;
    const read = () => {
      const n = ++latest;
      store.list().then((list) => current && n === latest && setRecords(list));
    };
    read();
    const unsubscribe = store.subscribe(read);
    return () => {
      current = false;
      unsubscribe();
    };
  }, [store]);

  /** Drill progress goes too: it only means something next to its reviews. */
  const clear = useCallback(async () => {
    clearStreak();
    await Promise.all([store?.clear(), progress?.clear()]);
  }, [store, progress]);

  return { available: store !== null, records, clear };
}
