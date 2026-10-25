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
import { createBatch, isActive, type Batch } from '@/lib/analysis/batch';
import {
  openIdbStore,
  watched,
  type AnalysisStore,
  type WatchedStore,
} from '@/lib/analysis/cache';
import {
  openIdbProgress,
  type ProgressStore,
} from '@/lib/analysis/drill-progress';
import type { GameAnalysis } from '@/lib/analysis/game-analysis';
import type { AnalysisLevel } from '@/lib/analysis/levels';
import {
  createProbe,
  type Probe,
  type ProbeInput,
  type ProbeSnapshot,
} from '@/lib/analysis/probe';
import type { SpawnLane } from '@/lib/analysis/protocol';

const AnalyzerContext = createContext<Analyzer | null>(null);
const ProbeContext = createContext<Probe | null>(null);
const BatchContext = createContext<Batch | null>(null);
const StoreContext = createContext<WatchedStore | null>(null);
const ProgressContext = createContext<ProgressStore | null>(null);

/**
 * Mounted once above the pages, so analysis survives route changes. `level`
 * is the user's setting; this is its only mirror. `spawn`, `store` and
 * `progress` are for tests; the two stores default to the browser's IndexedDB
 * (none where it is missing), and null turns saving off.
 */
export function AnalysisProvider({
  level,
  spawn,
  store,
  progress,
  children,
}: {
  level: AnalysisLevel;
  spawn?: SpawnLane | null;
  store?: AnalysisStore | null;
  progress?: ProgressStore | null;
  children: ReactNode;
}) {
  const [saved] = useState(() => {
    const opened = store === undefined ? openIdbStore() : store;
    return opened && watched(opened);
  });
  const [drills] = useState(() =>
    progress === undefined ? openIdbProgress() : progress,
  );
  const [analyzer] = useState(() =>
    createAnalyzer({ level, spawn, store: saved }),
  );
  const [probe] = useState(() => createProbe({ level, spawn }));
  const [batch] = useState(() =>
    createBatch({
      analyzer: createAnalyzer({ level, spawn, store: saved }),
      foreground: analyzer,
    }),
  );
  useEffect(() => analyzer.setLevel(level), [analyzer, level]);
  useEffect(() => probe.setLevel(level), [probe, level]);
  useEffect(() => () => analyzer.dispose(), [analyzer]);
  useEffect(() => () => probe.dispose(), [probe]);
  useEffect(() => () => batch.dispose(), [batch]);
  return (
    <StoreContext.Provider value={saved}>
      <ProgressContext.Provider value={drills}>
        <AnalyzerContext.Provider value={analyzer}>
          <ProbeContext.Provider value={probe}>
            <BatchContext.Provider value={batch}>
              {children}
            </BatchContext.Provider>
          </ProbeContext.Provider>
        </AnalyzerContext.Provider>
      </ProgressContext.Provider>
    </StoreContext.Provider>
  );
}

/** The saved reviews, for pages that list or clear them. null where nothing can be saved. */
export function useAnalysisStore(): WatchedStore | null {
  return useContext(StoreContext);
}

/** How each drill went, for the drill page. null where nothing can be saved. */
export function useDrillProgress(): ProgressStore | null {
  return useContext(ProgressContext);
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

/**
 * "I am looking at this position, which is not in the game" (a side line):
 * searches it on a lane of its own, apart from the game's analysis. null
 * input goes idle. Memoize `input`, or every render looks again.
 */
export function useProbe(input: ProbeInput | null): ProbeSnapshot {
  const probe = useContext(ProbeContext);
  if (!probe) throw new Error('useProbe must be used within AnalysisProvider');
  useEffect(() => probe.look(input), [probe, input]);
  useEffect(() => () => probe.look(null), [probe]);
  return useSyncExternalStore(probe.subscribe, probe.getSnapshot);
}

/**
 * Games reviewed in the background, one after another; see batch.ts. It runs
 * across route changes and gives way to the review on screen.
 */
export function useBatch() {
  const batch = useContext(BatchContext);
  if (!batch) throw new Error('useBatch must be used within AnalysisProvider');
  const snapshot = useSyncExternalStore(batch.subscribe, batch.getSnapshot);
  return { snapshot, start: batch.start, cancel: batch.cancel };
}

/** The id of the game the batch is on, so a list re-renders only when it moves on. */
export function useBatchGame(): string | null {
  const batch = useContext(BatchContext);
  if (!batch)
    throw new Error('useBatchGame must be used within AnalysisProvider');
  return useSyncExternalStore(batch.subscribe, () => {
    const now = batch.getSnapshot();
    return isActive(now) ? now.current.id : null;
  });
}
