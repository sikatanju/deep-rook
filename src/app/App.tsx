import {
  CastleIcon,
  LibraryIcon,
  PlayCircleIcon,
  SettingsIcon,
  type LucideIcon,
} from 'lucide-react';

import { ROUTES, useRoute, type Route } from '@/app/router';
import { AppProvider } from '@/app/store';
import { GamePicker } from '@/components/game-picker/game-picker';
import { PgnImport } from '@/components/game-picker/pgn-import';
import { ReviewPage } from '@/components/review/review-page';
import { SettingsPage } from '@/components/settings/settings-page';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const NAV: Record<Route, { label: string; icon: LucideIcon }> = {
  games: { label: 'Games', icon: LibraryIcon },
  review: { label: 'Review', icon: PlayCircleIcon },
  settings: { label: 'Settings', icon: SettingsIcon },
};

function GamesPage() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <GamePicker />
      <PgnImport />
    </div>
  );
}

const PAGES: Record<Route, () => React.ReactElement> = {
  games: GamesPage,
  review: ReviewPage,
  settings: SettingsPage,
};

function Shell() {
  const route = useRoute();
  const Page = PAGES[route];
  return (
    <div className="min-h-svh md:grid md:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="flex items-center justify-between border-b p-4 md:sticky md:top-0 md:h-svh md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CastleIcon aria-hidden className="size-6" />
          DeepRook
        </h1>
        <nav
          aria-label="Main"
          className="bg-background fixed inset-x-0 bottom-0 z-10 flex justify-around border-t p-1 md:static md:mt-6 md:flex-col md:justify-start md:gap-1 md:border-0 md:bg-transparent md:p-0"
        >
          {ROUTES.map((r) => {
            const { label, icon: Icon } = NAV[r];
            return (
              <a
                key={r}
                href={`#/${r}`}
                aria-current={r === route ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring flex flex-1 flex-col items-center gap-0.5 rounded-md px-3 py-2 text-xs outline-none focus-visible:ring-2 md:flex-none md:flex-row md:gap-3 md:text-sm',
                  r === route
                    ? 'bg-accent font-medium'
                    : 'opacity-70 hover:opacity-100',
                )}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </a>
            );
          })}
        </nav>
        <div className="md:mt-auto">
          <ThemeToggle />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl p-4 pb-24 md:p-8">
        <Page />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ThemeProvider>
  );
}
