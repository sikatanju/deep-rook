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

export const BOARD_THEMES = {
  green: { light: '#eeeed2', dark: '#769656' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  slate: { light: '#c9ced6', dark: '#5d6b85' },
} as const;
export type BoardTheme = keyof typeof BOARD_THEMES;

export type Settings = {
  boardTheme: BoardTheme;
  coordinates: boolean;
  autoplayMs: number;
  analysisLevel: AnalysisLevel;
};

const DEFAULT_SETTINGS: Settings = {
  boardTheme: 'green',
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
  const { boardTheme, coordinates, autoplayMs, analysisLevel } = data;
  return {
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

function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return DEFAULT_SETTINGS; // storage blocked
  }
}

export type Loaded = {
  id: number;
  replay: Replay;
  /** Where the game came from, for the header. */
  source: string;
  /** Bottom side of the board on first show. */
  orientation: 'w' | 'b';
};

type Store = ReturnType<typeof useGamePicker> & {
  loaded: Loaded | null;
  openGame: (game: Game) => void;
  openPgn: (pgn: string, source: string) => void;
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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [settings, setAll] = useState(loadSettings);
  const { selectGame } = picker;

  const openPgn = useCallback((pgn: string, source: string) => {
    setLoaded({
      id: nextId++,
      replay: parseReplay(pgn),
      source,
      orientation: 'w',
    });
    navigate('review');
  }, []);

  const openGame = useCallback(
    (game: Game) => {
      const replay = parseReplay(game.pgn);
      const me =
        picker.state.status === 'ready' ? picker.state.profile.username : '';
      setLoaded({
        id: nextId++,
        replay,
        source: `${game.white.username} vs ${game.black.username}`,
        orientation: game.black.username.toLowerCase() === me ? 'b' : 'w',
      });
      selectGame(game);
      navigate('review');
    },
    [picker.state, selectGame],
  );

  const setSettings = useCallback(
    (patch: Partial<Settings>) => setAll((s) => ({ ...s, ...patch })),
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Storage full or blocked: settings still work for this session.
    }
  }, [settings]);

  const store = { ...picker, loaded, openGame, openPgn, settings, setSettings };
  return (
    <StoreContext.Provider value={store}>
      <AnalysisProvider level={settings.analysisLevel}>
        {children}
      </AnalysisProvider>
    </StoreContext.Provider>
  );
}
