import { useCallback, useEffect, useState } from 'react';

import { useAnalysisStore } from '@/hooks/use-game-analysis';
import type { StoredAnalysis } from '@/lib/analysis/cache';

/**
 * The reviews saved in this browser, newest first. `records` is null until
 * the first read finishes, and stays [] when nothing can be saved here.
 */
export function useSavedReviews() {
  const store = useAnalysisStore();
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

  const clear = useCallback(async () => {
    await store?.clear();
    setRecords([]);
  }, [store]);

  return { available: store !== null, records, clear };
}
