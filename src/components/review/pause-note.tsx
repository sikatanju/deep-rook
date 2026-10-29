import { Button } from '@/components/ui/button';
import { usePause } from '@/hooks/use-game-analysis';

/**
 * Says analysis is waiting on a low battery, and lets the player go on anyway.
 * A hidden tab needs no note, since nobody is there to read it.
 */
export function PauseNote() {
  const { reason, continueAnyway } = usePause();
  if (reason !== 'battery') return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-ink-muted">
        Analysis is paused while your battery is low. Plug in and it carries on.
      </p>
      <Button size="sm" onClick={continueAnyway}>
        Continue anyway
      </Button>
    </div>
  );
}
