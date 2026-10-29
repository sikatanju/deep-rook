import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  clearLastReview,
  loadLastReview,
  saveLastReview,
} from '@/app/last-review';
import { navigate } from '@/app/router';
import { AnalysisProvider } from '@/hooks/use-game-analysis';
import { useGamePicker } from '@/hooks/use-game-picker';
import { useLichessPicker } from '@/hooks/use-lichess-picker';
import type { AnalysisStore } from '@/lib/analysis/cache';
import type { ProgressStore } from '@/lib/analysis/drill-progress';
import {
  DEFAULT_LEVEL,
  isAnalysisLevel,
  type AnalysisLevel,
} from '@/lib/analysis/levels';
import { parseBoardSize } from '@/lib/board-size';
import { parseExtraNames } from '@/lib/extra-names';
import type { Game, Site } from '@/lib/chesscom/types';
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

export const PIECE_SETS = {
  kiwen: { name: 'Kiwen Suwi' },
  rhosgfx: { name: 'RhosGFX' },
  papercut: { name: 'Papercut' },
} as const;
export type PieceSet = keyof typeof PIECE_SETS;

export function pieceSrc(set: PieceSet, code: string) {
  return `/pieces/${set}/${code}.svg`;
}

export type Settings = {
  palette: PaletteId;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  coordinates: boolean;
  sound: boolean;
  autoplayMs: number;
  analysisLevel: AnalysisLevel;
  /** The review board's width in px; null is the responsive default. */
  boardSize: number | null;
  /** Other names the player plays under; they count as mine like a saved username. */
  extraNames: string[];
  /** The Games page's batch review takes only the games the player lost. */
  batchLossesOnly: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  palette: DEFAULT_PALETTE,
  boardTheme: 'palette',
  pieceSet: 'kiwen',
  coordinates: true,
  sound: true,
  autoplayMs: 900,
  analysisLevel: DEFAULT_LEVEL,
  boardSize: null,
  extraNames: [],
  batchLossesOnly: false,
};

const SETTINGS_KEY = 'settings';
/** A year, matching how long a saved palette used to live in local storage. */
const SETTINGS_MAX_AGE = 60 * 60 * 24 * 365;

function readSettingsCookie(): string | null {
  try {
    const prefix = `${SETTINGS_KEY}=`;
    const found = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    if (!found) return null;
    return decodeURIComponent(found.slice(prefix.length));
  } catch {
    return null;
  }
}

/** The cookie is the copy that survives clearing local storage. */
function writeSettingsCookie(settings: Settings): boolean {
  try {
    const value = encodeURIComponent(JSON.stringify(settings));
    document.cookie = `${SETTINGS_KEY}=${value}; Path=/; Max-Age=${SETTINGS_MAX_AGE}; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

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
  const {
    palette,
    boardTheme,
    pieceSet,
    coordinates,
    sound,
    autoplayMs,
    analysisLevel,
    boardSize,
    extraNames,
    batchLossesOnly,
  } = data;
  return {
    palette: isPaletteId(palette) ? palette : d.palette,
    boardTheme:
      typeof boardTheme === 'string' && Object.hasOwn(BOARD_THEMES, boardTheme)
        ? (boardTheme as BoardTheme)
        : d.boardTheme,
    pieceSet:
      typeof pieceSet === 'string' && Object.hasOwn(PIECE_SETS, pieceSet)
        ? (pieceSet as PieceSet)
        : d.pieceSet,
    coordinates: typeof coordinates === 'boolean' ? coordinates : d.coordinates,
    sound: typeof sound === 'boolean' ? sound : d.sound,
    autoplayMs:
      typeof autoplayMs === 'number' && autoplayMs >= 300 && autoplayMs <= 2500
        ? autoplayMs
        : d.autoplayMs,
    analysisLevel: isAnalysisLevel(analysisLevel)
      ? analysisLevel
      : d.analysisLevel,
    boardSize: parseBoardSize(boardSize),
    extraNames: parseExtraNames(extraNames),
    batchLossesOnly:
      typeof batchLossesOnly === 'boolean' ? batchLossesOnly : d.batchLossesOnly,
  };
}

/**
 * The cookie wins. Without one, local storage still holds a palette saved
 * before the move, and the old light/dark toggle's "dark" maps to Arcade
 * Night. layouts/main.astro makes the same choice before first paint.
 */
export function loadSettings(): Settings {
  try {
    const cookie = readSettingsCookie();
    if (cookie !== null) return parseSettings(cookie);
    const raw = localStorage.getItem(SETTINGS_KEY);
    const settings = parseSettings(raw);
    const saved = (raw && (JSON.parse(raw) as { palette?: unknown })) || {};
    // No palette chosen yet: follow the OS, until the first change saves one.
    if (
      !isPaletteId(saved.palette) &&
      (localStorage.getItem('theme') === 'dark' ||
        window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    )
      return { ...settings, palette: 'arcade' };
    return settings;
  } catch {
    return DEFAULT_SETTINGS; // storage blocked
  }
}

export function saveSettings(settings: Settings): void {
  if (writeSettingsCookie(settings)) {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem('theme');
    } catch {
      // The cookie is already written.
    }
    return;
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Cookie and local storage blocked: settings still work for this session.
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

/** What the Viewer reviews: a staged game, the mode, and the ply on screen. */
export type Loaded = Staged & { level: AnalysisLevel; index: number };

type Store = ReturnType<typeof useGamePicker> & {
  lichess: ReturnType<typeof useLichessPicker>;
  /** The site the Games page searches. */
  site: Site;
  setSite: (site: Site) => void;
  staged: Staged | null;
  loaded: Loaded | null;
  stageGame: (game: Game) => void;
  /**
   * Stages a pasted PGN. `mine` is the side the player said they played, null
   * for "not me" and absent when they said nothing; the review opens from
   * `orientation`.
   */
  stagePgn: (
    pgn: string,
    source: string,
    side?: { mine?: 'w' | 'b' | null; orientation?: 'w' | 'b' },
  ) => void;
  /** Reviews the staged game at `level`, else the remembered mode, and opens the review page. */
  startReview: (level?: AnalysisLevel) => void;
  /**
   * Reviews a game that is not on the Games page (a saved one) at `level` and
   * opens the review page, in one step: startReview would read a staged game
   * the state has not caught up to yet.
   */
  reviewReplay: (
    replay: Replay,
    source: string,
    orientation: 'w' | 'b',
    level: AnalysisLevel,
  ) => void;
  /** Changes the mode of the running review and the default for the next. */
  setReviewLevel: (level: AnalysisLevel) => void;
  /** Remembers the ply a refresh should reopen. The side line stays unsaved. */
  setReviewIndex: (index: number) => void;
  /** Forgets the game on screen, including the copy a refresh would reopen. */
  forgetOpenReview: () => void;
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

/** `store` is for tests; see AnalysisProvider. */
export function AppProvider({
  children,
  store: analyses,
  progress,
}: {
  children: ReactNode;
  store?: AnalysisStore | null;
  progress?: ProgressStore | null;
}) {
  const picker = useGamePicker();
  const lichess = useLichessPicker();
  const [site, setSite] = useState<Site>('chesscom');
  const [staged, setStaged] = useState<Staged | null>(null);
  // A refresh reopens the game that was under review.
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    const last = loadLastReview();
    return last && { ...last, id: nextId++ };
  });
  const [settings, setAll] = useState(loadSettings);
  const { selectGame: selectChessCom } = picker;
  const { selectGame: selectLichess } = lichess;

  /** Selects `game` in its own site's list and clears the other's; null clears both. */
  const selectGame = useCallback(
    (game: Game | null) => {
      selectChessCom(game?.site === 'chesscom' ? game : null);
      selectLichess(game?.site === 'lichess' ? game : null);
    },
    [selectChessCom, selectLichess],
  );

  const stagePgn = useCallback(
    (
      pgn: string,
      source: string,
      {
        mine,
        orientation = mine ?? 'w',
      }: Parameters<Store['stagePgn']>[2] = {},
    ) => {
      const replay = parseReplay(pgn);
      setStaged({
        id: nextId++,
        replay: mine === undefined ? replay : { ...replay, mine },
        source,
        orientation,
      });
      selectGame(null);
    },
    [selectGame],
  );

  const stageGame = useCallback(
    (game: Game) => {
      const replay = parseReplay(game.pgn);
      const searched =
        game.site === 'lichess'
          ? lichess.state.status === 'ready' && lichess.state.username
          : picker.state.status === 'ready' && picker.state.profile.username;
      const me = (searched || '').toLowerCase();
      setStaged({
        id: nextId++,
        replay,
        source: `${game.white.username} vs ${game.black.username}`,
        orientation: game.black.username.toLowerCase() === me ? 'b' : 'w',
      });
      selectGame(game);
    },
    [picker.state, lichess.state, selectGame],
  );

  const setSettings = useCallback(
    (patch: Partial<Settings>) => setAll((s) => ({ ...s, ...patch })),
    [],
  );

  const startReview = useCallback(
    (level: AnalysisLevel = settings.analysisLevel) => {
      if (!staged) return;
      setLoaded((current) => ({
        ...staged,
        level,
        index: current?.id === staged.id ? current.index : 0,
      }));
      navigate('review');
    },
    [staged, settings.analysisLevel],
  );

  const reviewReplay = useCallback(
    (
      replay: Replay,
      source: string,
      orientation: 'w' | 'b',
      level: AnalysisLevel,
    ) => {
      const game = { id: nextId++, replay, source, orientation };
      setStaged(game);
      setLoaded({ ...game, level, index: 0 });
      selectGame(null);
      navigate('review');
    },
    [selectGame],
  );

  const setReviewLevel = useCallback(
    (level: AnalysisLevel) => {
      setLoaded((l) => l && { ...l, level });
      setSettings({ analysisLevel: level });
    },
    [setSettings],
  );

  const setReviewIndex = useCallback((index: number) => {
    setLoaded((l) => (l && l.index !== index ? { ...l, index } : l));
  }, []);

  const forgetOpenReview = useCallback(() => {
    clearLastReview();
    setLoaded(null);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.palette;
  }, [settings.palette]);

  useEffect(() => {
    if (!loaded) return;
    const { replay, source, orientation, level, index } = loaded;
    saveLastReview({ replay, source, orientation, level, index });
  }, [loaded]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const store = {
    ...picker,
    selectGame,
    lichess,
    site,
    setSite,
    staged,
    loaded,
    stageGame,
    stagePgn,
    startReview,
    reviewReplay,
    setReviewLevel,
    setReviewIndex,
    forgetOpenReview,
    settings,
    setSettings,
  };
  return (
    <StoreContext.Provider value={store}>
      {/* The review's level, not the setup radios': picking a mode for the
          next game must not retarget a running analysis. */}
      <AnalysisProvider
        level={loaded?.level ?? settings.analysisLevel}
        store={analyses}
        progress={progress}
      >
        {children}
      </AnalysisProvider>
    </StoreContext.Provider>
  );
}
