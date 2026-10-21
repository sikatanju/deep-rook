// The UI's only door into analysis. Analysis state lives outside React state:
// the store value is rebuilt every render, so streaming engine progress
// through it would re-render the whole app. useSyncExternalStore re-renders
// only subscribers, at most once per flush.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  createAnalyzer,
  type AnalysisGame,
  type Analyzer,
} from '@/lib/analysis/analyzer';
import { openIdbStore, type AnalysisStore } from '@/lib/analysis/cache';
import type { GameAnalysis } from '@/lib/analysis/game-analysis';
import type { AnalysisLevel } from '@/lib/analysis/levels';
import type { SpawnLane } from '@/lib/analysis/protocol';

const AnalyzerContext = createContext<Analyzer | null>(null);
const StoreContext = createContext<AnalysisStore | null>(null);

/**
 * Mounted once above the pages, so analysis survives route changes. `level`
 * is the user's setting; this is its only mirror. `spawn` and `store` are for
 * tests; `store` defaults to the browser's IndexedDB (none where it is
 * missing), and null turns saving off.
 */
export function AnalysisProvider({
  level,
  spawn,
  store,
  children,
}: {
  level: AnalysisLevel;
  spawn?: SpawnLane | null;
  store?: AnalysisStore | null;
  children: ReactNode;
}) {
  const [saved] = useState(() =>
    store === undefined ? openIdbStore() : store,
  );
  const [analyzer] = useState(() =>
    createAnalyzer({ level, spawn, store: saved }),
  );
  useEffect(() => analyzer.setLevel(level), [analyzer, level]);
  useEffect(() => () => analyzer.dispose(), [analyzer]);
  return (
    <StoreContext.Provider value={saved}>
      <AnalyzerContext.Provider value={analyzer}>
        {children}
      </AnalyzerContext.Provider>
    </StoreContext.Provider>
  );
}

/** The saved reviews, for pages that list or clear them. null where nothing can be saved. */
export function useAnalysisStore(): AnalysisStore | null {
  return useContext(StoreContext);
}

/**
 * "I am showing position `index` of `game`": starts or redirects analysis and
 * returns the live document. null until the first flush for this game.
 */
export function useGameAnalysis(
  game: AnalysisGame,
  index: number,
): GameAnalysis | null {
  const analyzer = useContext(AnalyzerContext);
  if (!analyzer)
    throw new Error('useGameAnalysis must be used within AnalysisProvider');
  useEffect(() => analyzer.view(game, index), [analyzer, game, index]);
  const snapshot = useSyncExternalStore(
    analyzer.subscribe,
    analyzer.getSnapshot,
  );
  return snapshot?.gameId === game.id ? snapshot : null;
}
