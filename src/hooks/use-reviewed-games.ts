import { useMemo } from 'react';

import { useSavedReviews } from '@/hooks/use-saved-reviews';
import type { GameKey } from '@/lib/analysis/cache';
import type { AnalysisLevel } from '@/lib/analysis/levels';
import { gameLink } from '@/lib/chess/replay';

export type ReviewedGames = {
  /** By the game's page, which listed games carry without parsing their PGN. */
  byLink: ReadonlyMap<string, AnalysisLevel>;
  /** By position, for a game already parsed. */
  byKey: ReadonlyMap<GameKey, AnalysisLevel>;
};

/** The level each saved review reached. null until the saved reviews are read. */
export function useReviewedGames(): ReviewedGames | null {
  const { records } = useSavedReviews();
  return useMemo(() => {
    if (!records) return null;
    const byLink = new Map<string, AnalysisLevel>();
    const byKey = new Map<GameKey, AnalysisLevel>();
    for (const { key, level, replay } of records) {
      byKey.set(key, level);
      const link = gameLink(replay.headers);
      if (link) byLink.set(link, level);
    }
    return { byLink, byKey };
  }, [records]);
}
