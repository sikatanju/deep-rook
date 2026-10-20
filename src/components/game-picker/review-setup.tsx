import { useStore, type Staged } from '@/app/store';
import { LevelPicker } from '@/components/level-picker';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { ANALYSIS_LEVELS } from '@/lib/analysis/levels';

export function ReviewSetup({ staged }: { staged: Staged }) {
  const { loaded, settings, setSettings, startReview } = useStore();
  const level = settings.analysisLevel;
  return (
    <Panel
      tag="Staged"
      title={staged.source}
      subtitle={`${staged.replay.plies.length} moves`}
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
      <Button variant="primary" onClick={startReview}>
        {loaded?.id === staged.id ? 'Continue review' : 'Review game'}
      </Button>
    </Panel>
  );
}
