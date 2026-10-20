import { useStore, type Staged } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { ANALYSIS_LEVELS, LEVELS } from '@/lib/analysis/levels';
import { cn } from '@/lib/utils';

export function ReviewSetup({ staged }: { staged: Staged }) {
  const { loaded, settings, setSettings, startReview } = useStore();
  const level = settings.analysisLevel;
  return (
    <Card
      size="sm"
      className="bg-card sticky bottom-20 z-10 md:bottom-4 lg:top-8 lg:bottom-auto"
    >
      <CardContent className="flex flex-col gap-3">
        <div>
          <CardTitle>{staged.source}</CardTitle>
          <p className="text-sm opacity-70">
            {staged.replay.plies.length} moves
          </p>
        </div>
        <fieldset className="flex gap-1 rounded-md border p-1">
          <legend className="sr-only">Review mode</legend>
          {LEVELS.map((l) => (
            <label
              key={l}
              className={cn(
                'has-[:focus-visible]:ring-ring flex-1 cursor-pointer rounded px-2 py-1 text-center text-sm has-[:focus-visible]:ring-2',
                level === l ? 'bg-accent font-medium' : 'opacity-70',
              )}
            >
              <input
                type="radio"
                name="review-mode"
                className="sr-only"
                checked={level === l}
                onChange={() => setSettings({ analysisLevel: l })}
              />
              {ANALYSIS_LEVELS[l].label}
            </label>
          ))}
        </fieldset>
        <p aria-live="polite" className="text-sm opacity-70">
          {ANALYSIS_LEVELS[level].blurb}
        </p>
        <Button onClick={startReview}>
          {loaded?.id === staged.id ? 'Continue review' : 'Review game'}
        </Button>
      </CardContent>
    </Card>
  );
}
