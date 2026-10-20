import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { navigate } from '@/app/router';
import { AnalysisProvider } from '@/hooks/use-game-analysis';
import { useGamePicker } from '@/hooks/use-game-picker';
import {
  DEFAULT_LEVEL,
  isAnalysisLevel,
  type AnalysisLevel,
} from '@/lib/analysis/levels';
import type { Game } from '@/lib/chesscom/types';
import { parseReplay, type Replay } from '@/lib/chess/replay';
import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from '@/lib/palettes';

export const BOARD_THEMES = {
  // Follows the active palette, so the board changes with it.
  palette: { light: 'var(--board-light)', dark: 'var(--board-dark)' },
  green: { light: '#eeeed2', dark: '#769656' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  slate: { light: '#c9ced6', dark: '#5d6b85' },
} as const;
export type BoardTheme = keyof typeof BOARD_THEMES;

export type Settings = {
  palette: PaletteId;
  boardTheme: BoardTheme;
  coordinates: boolean;
  autoplayMs: number;
  analysisLevel: AnalysisLevel;
};

const DEFAULT_SETTINGS: Settings = {
  palette: DEFAULT_PALETTE,
  boardTheme: 'palette',
  coordinates: true,
  autoplayMs: 900,
  analysisLevel: DEFAULT_LEVEL,
};

const SETTINGS_KEY = 'settings';

/** Field by field, so one stale or hand-edited value falls back alone. */
export function parseSettings(raw: string | null): Settings {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object')
      data = parsed as Record<string, unknown>;
  } catch {
    // Corrupt JSON: defaults.
  }
  const d = DEFAULT_SETTINGS;
  const { palette, boardTheme, coordinates, autoplayMs, analysisLevel } = data;
  return {
    palette: isPaletteId(palette) ? palette : d.palette,
    boardTheme:
      typeof boardTheme === 'string' && Object.hasOwn(BOARD_THEMES, boardTheme)
        ? (boardTheme as BoardTheme)
        : d.boardTheme,
    coordinates: typeof coordinates === 'boolean' ? coordinates : d.coordinates,
    autoplayMs:
      typeof autoplayMs === 'number' && autoplayMs >= 300 && autoplayMs <= 2500
        ? autoplayMs
        : d.autoplayMs,
    analysisLevel: isAnalysisLevel(analysisLevel)
      ? analysisLevel
      : d.analysisLevel,
  };
}

/**
 * A saved palette wins. Without one, the old light/dark toggle's "dark" maps to
 * Arcade Night, the dark palette. layouts/main.astro makes the same choice
 * before first paint.
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const settings = parseSettings(raw);
    const saved = (raw && (JSON.parse(raw) as { palette?: unknown })) || {};
    if (!isPaletteId(saved.palette) && localStorage.getItem('theme') === 'dark')
      return { ...settings, palette: 'arcade' };
    return settings;
  } catch {
    return DEFAULT_SETTINGS; // storage blocked
  }
}

/** A game picked on the Games page, not yet reviewed. */
export type Staged = {
  /** Assigned once at staging, so reviewing it again continues the analysis. */
  id: number;
  replay: Replay;
  /** Where the game came from, for the header. */
  source: string;
  /** Bottom side of the board on first show. */
  orientation: 'w' | 'b';
};

/** What the Viewer reviews: a staged game plus the mode it was started at. */
export type Loaded = Staged & { level: AnalysisLevel };

type Store = ReturnType<typeof useGamePicker> & {
  staged: Staged | null;
  loaded: Loaded | null;
  stageGame: (game: Game) => void;
  stagePgn: (pgn: string, source: string) => void;
  /** Reviews the staged game at the remembered mode and opens the review page. */
  startReview: () => void;
  /** Changes the mode of the running review and the default for the next. */
  setReviewLevel: (level: AnalysisLevel) => void;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
};

let nextId = 0;

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used within AppProvider');
  return store;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const picker = useGamePicker();
  const [staged, setStaged] = useState<Staged | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [settings, setAll] = useState(loadSettings);
  const { selectGame } = picker;

  const stagePgn = useCallback(
    (pgn: string, source: string) => {
      setStaged({
        id: nextId++,
        replay: parseReplay(pgn),
        source,
        orientation: 'w',
      });
      selectGame(null);
    },
    [selectGame],
  );

  const stageGame = useCallback(
    (game: Game) => {
      const replay = parseReplay(game.pgn);
      const me =
        picker.state.status === 'ready' ? picker.state.profile.username : '';
      setStaged({
        id: nextId++,
        replay,
        source: `${game.white.username} vs ${game.black.username}`,
        orientation: game.black.username.toLowerCase() === me ? 'b' : 'w',
      });
      selectGame(game);
    },
    [picker.state, selectGame],
  );

  const setSettings = useCallback(
    (patch: Partial<Settings>) => setAll((s) => ({ ...s, ...patch })),
    [],
  );

  const startReview = useCallback(() => {
    if (!staged) return;
    setLoaded({ ...staged, level: settings.analysisLevel });
    navigate('review');
  }, [staged, settings.analysisLevel]);

  const setReviewLevel = useCallback(
    (level: AnalysisLevel) => {
      setLoaded((l) => l && { ...l, level });
      setSettings({ analysisLevel: level });
    },
    [setSettings],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = settings.palette;
  }, [settings.palette]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Storage full or blocked: settings still work for this session.
    }
  }, [settings]);

  const store = {
    ...picker,
    staged,
    loaded,
    stageGame,
    stagePgn,
    startReview,
    setReviewLevel,
    settings,
    setSettings,
  };
  return (
    <StoreContext.Provider value={store}>
      {/* The review's level, not the setup radios': picking a mode for the
          next game must not retarget a running analysis. */}
      <AnalysisProvider level={loaded?.level ?? settings.analysisLevel}>
        {children}
      </AnalysisProvider>
    </StoreContext.Provider>
  );
}
