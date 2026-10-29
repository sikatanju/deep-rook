import { useMemo } from 'react';

import { useStore, type Staged } from '@/app/store';
import { LevelPicker } from '@/components/level-picker';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import type { ReviewedGames } from '@/hooks/use-reviewed-games';
import { gameKey } from '@/lib/analysis/cache';
import { ANALYSIS_LEVELS, satisfies } from '@/lib/analysis/levels';

export function ReviewSetup({
  staged,
  reviewed,
}: {
  staged: Staged;
  reviewed: ReviewedGames | null;
}) {
  const { loaded, settings, setSettings, startReview } = useStore();
  const level = settings.analysisLevel;
  const key = useMemo(() => gameKey(staged.replay), [staged.replay]);
  const saved = reviewed?.byKey.get(key) ?? null;
  // A review saved at this mode or deeper opens as it was, with no engine.
  const open = saved !== null && satisfies(saved, level);
  return (
    <Panel
      title={staged.source}
      subtitle={`${staged.replay.plies.length} moves${saved ? `, reviewed at ${ANALYSIS_LEVELS[saved].label}` : ''}`}
      className="sticky bottom-20 z-10 md:bottom-4 lg:top-8 lg:bottom-auto"
    >
      <LevelPicker
        compact
        name="review-mode"
        value={level}
        onChange={(analysisLevel) => setSettings({ analysisLevel })}
      />
      <p aria-live="polite" className="text-ink-muted">
        {ANALYSIS_LEVELS[level].blurb}
      </p>
      <Button
        variant="primary"
        onClick={() => startReview(open ? saved : level)}
      >
        {loaded?.id === staged.id
          ? 'Continue review'
          : open
            ? 'Open review'
            : 'Review game'}
      </Button>
    </Panel>
  );
}
