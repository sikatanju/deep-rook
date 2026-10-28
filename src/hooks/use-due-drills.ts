import { useEffect, useState } from 'react';

import { readSavedUsernames } from '@/components/game-picker/username-form';
import { useDrillProgress } from '@/hooks/use-game-analysis';
import { useSavedReviews } from '@/hooks/use-saved-reviews';
import { drillQueue } from '@/lib/analysis/drill';
import { plan } from '@/lib/analysis/drill-progress';

/**
 * How many drills are due now. Read again when a review is saved and when
 * `route` changes, which is how a finished drill session shows up: progress
 * has no change feed.
 */
export function useDueDrills(route: string) {
  const { records } = useSavedReviews();
  const progress = useDrillProgress();
  const [due, setDue] = useState(0);

  useEffect(() => {
    if (!records) return;
    let current = true;
    (progress?.list() ?? Promise.resolve([])).then((list) => {
      if (!current) return;
      const byId = new Map(list.map((p) => [p.id, p]));
      const queue = drillQueue(records, readSavedUsernames());
      setDue(plan(queue, byId, Date.now()).due.length);
    });
    return () => {
      current = false;
    };
    // `route` only triggers the re-read.
  }, [records, progress, route]);

  return due;
}
