import { useCallback, useEffect, useState } from 'react';

import { useAnalysisStore, useDrillProgress } from '@/hooks/use-game-analysis';
import type { StoredAnalysis } from '@/lib/analysis/cache';

/**
 * The reviews saved in this browser, newest first. `records` is null until
 * the first read finishes, and stays [] when nothing can be saved here.
 */
export function useSavedReviews() {
  const store = useAnalysisStore();
  const progress = useDrillProgress();
  const [records, setRecords] = useState<StoredAnalysis[] | null>(
    store ? null : [],
  );

  useEffect(() => {
    if (!store) return;
    let current = true;
    store.list().then((list) => current && setRecords(list));
    return () => {
      current = false;
    };
  }, [store]);

  /** Drill progress goes too: it only means something next to its reviews. */
  const clear = useCallback(async () => {
    await Promise.all([store?.clear(), progress?.clear()]);
    setRecords([]);
  }, [store, progress]);

  return { available: store !== null, records, clear };
}
