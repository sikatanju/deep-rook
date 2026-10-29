import {
  ChartColumnIcon,
  LibraryIcon,
  PlayCircleIcon,
  SettingsIcon,
  TargetIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { ROUTES, useRoute, type Route } from '@/app/router';
import { AppProvider } from '@/app/store';
import { DrillPage } from '@/components/drill/drill-page';
import { GamesPage } from '@/components/game-picker/games-page';
import { NavRail } from '@/components/layout/nav-rail';
import { NewGamesBanner } from '@/components/new-games-banner';
import { OverviewPage } from '@/components/overview/overview-page';
import { ReviewPage } from '@/components/review/review-page';
import { SettingsPage } from '@/components/settings/settings-page';
import { Button } from '@/components/ui/button';
import { useDueDrills } from '@/hooks/use-due-drills';
import { useSharedLink, type SharedLink } from '@/hooks/use-shared-link';
import type { AnalysisStore } from '@/lib/analysis/cache';
import type { ProgressStore } from '@/lib/analysis/drill-progress';
import { cn } from '@/lib/utils';

const NAV: Record<Route, { label: string; icon: LucideIcon }> = {
  games: { label: 'Games', icon: LibraryIcon },
  overview: { label: 'Overview', icon: ChartColumnIcon },
  drill: { label: 'Drill', icon: TargetIcon },
  review: { label: 'Review', icon: PlayCircleIcon },
  settings: { label: 'Settings', icon: SettingsIcon },
};

const PAGES: Record<Route, { Page: () => React.ReactElement; wide: boolean }> =
  {
    games: { Page: GamesPage, wide: false },
    overview: { Page: OverviewPage, wide: false },
    drill: { Page: DrillPage, wide: false },
    review: { Page: ReviewPage, wide: true },
    settings: { Page: SettingsPage, wide: false },
  };

/** Below this width the rail starts collapsed, to leave the page its room. */
const ROOMY = '(min-width: 1400px)';

/**
 * Whether the rail is collapsed. It follows the screen width, folding away when
 * space runs short and returning when there is plenty; the button overrides it
 * until the width next crosses that line.
 */
function useRailCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia?.(ROOMY).matches === false,
  );
  useEffect(() => {
    const query = window.matchMedia?.(ROOMY);
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setCollapsed(!e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return [collapsed, () => setCollapsed((c) => !c)] as const;
}

function BrokenLink({
  link,
  onDismiss,
}: {
  link: Extract<SharedLink, { status: 'broken' }>;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-md border-3 p-4 shadow-md"
    >
      <TriangleAlertIcon aria-hidden className="text-loss size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">That shared link did not open.</p>
        <p className="text-ink-muted">
          {link.message} Ask for a fresh link, or pick a game below.
        </p>
      </div>
      <Button size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const { Page, wide } = PAGES[route];
  const [collapsed, toggle] = useRailCollapsed();
  const { link, dismiss } = useSharedLink();
  // Not on the drill page itself: mid-session the count would be stale.
  const due = useDueDrills(route);
  return (
    <div
      className={cn(
        'min-h-svh md:grid',
        collapsed
          ? 'md:grid-cols-[5rem_minmax(0,1fr)]'
          : 'md:grid-cols-[220px_minmax(0,1fr)]',
      )}
    >
      <NavRail
        active={route}
        collapsed={collapsed}
        onToggle={toggle}
        items={ROUTES.map((id) => ({
          id,
          ...NAV[id],
          pinned: id === 'settings',
          badge: id === 'drill' && route !== 'drill' ? due : undefined,
        }))}
      />
      <div className="flex min-w-0 flex-col">
        <main
          className={cn(
            'flex w-full flex-1 flex-col gap-8 p-4 pb-24',
            // The review page is the board, so it gets the room the padding took.
            wide ? 'md:px-5 md:py-4' : 'mx-auto max-w-6xl md:p-8',
          )}
        >
          {link.status === 'broken' && (
            <BrokenLink link={link} onDismiss={dismiss} />
          )}
          <NewGamesBanner hidden={route === 'review'} />
          {link.status === 'opening' ? (
            <p role="status" className="text-ink-muted font-bold">
              Opening the shared game…
            </p>
          ) : (
            <Page />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App({
  store,
  progress,
}: {
  store?: AnalysisStore | null;
  progress?: ProgressStore | null;
}) {
  return (
    <AppProvider store={store} progress={progress}>
      <Shell />
    </AppProvider>
  );
}
