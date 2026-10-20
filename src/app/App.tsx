import {
  LibraryIcon,
  PlayCircleIcon,
  SettingsIcon,
  type LucideIcon,
} from 'lucide-react';

import { ROUTES, useRoute, type Route } from '@/app/router';
import { AppProvider, useStore } from '@/app/store';
import { GamesPage } from '@/components/game-picker/games-page';
import { NavRail } from '@/components/layout/nav-rail';
import { Ticker } from '@/components/layout/ticker';
import { ReviewPage } from '@/components/review/review-page';
import { SettingsPage } from '@/components/settings/settings-page';
import { cn } from '@/lib/utils';

const NAV: Record<Route, { label: string; icon: LucideIcon }> = {
  games: { label: 'Games', icon: LibraryIcon },
  review: { label: 'Review', icon: PlayCircleIcon },
  settings: { label: 'Settings', icon: SettingsIcon },
};

const PAGES: Record<Route, { Page: () => React.ReactElement; wide: boolean }> =
  {
    games: { Page: GamesPage, wide: false },
    review: { Page: ReviewPage, wide: true },
    settings: { Page: SettingsPage, wide: false },
  };

const TICKER = [
  'Engine runs on your device',
  'Works offline',
  'Same game, same numbers, any machine',
  'No account needed',
];

function Shell() {
  const route = useRoute();
  const { settings, setSettings } = useStore();
  const { Page, wide } = PAGES[route];
  return (
    <div className="min-h-svh md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <NavRail
        active={route}
        items={ROUTES.map((id) => ({ id, ...NAV[id] }))}
        palette={settings.palette}
        onPalette={(palette) => setSettings({ palette })}
      />
      <div className="flex min-w-0 flex-col">
        <Ticker items={TICKER} />
        <main
          className={cn(
            'flex w-full flex-1 flex-col gap-8 p-4 pb-24 md:p-8',
            !wide && 'mx-auto max-w-6xl',
          )}
        >
          <Page />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
