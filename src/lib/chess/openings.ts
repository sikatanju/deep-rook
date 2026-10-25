// Opening names by position, from the Lichess opening table that
// scripts/openings.mjs writes to openings.json. A position names the opening
// however the game reached it, and whatever site the game came from. The table
// is about 70 kB gzipped, so it loads on first use.

import { fenAt, type Replay } from './replay';

export type Opening = { eco: string; name: string };

export type OpeningBook = {
  /** The longest line in the table; no later position can match. */
  maxPlies: number;
  /** "ECO name" by placement, side, castling and en passant square. */
  positions: Readonly<Record<string, string>>;
};

const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** The name of the game's deepest position in the table; null when none is. */
export function openingOf(replay: Replay, book: OpeningBook): Opening | null {
  for (let i = Math.min(replay.plies.length, book.maxPlies); i > 0; i--) {
    const entry = book.positions[positionKey(fenAt(replay, i))];
    if (!entry) continue;
    const space = entry.indexOf(' ');
    return { eco: entry.slice(0, space), name: entry.slice(space + 1) };
  }
  return null;
}

let loading: Promise<OpeningBook> | undefined;

/** One fetch per page load; a failed one is retried on the next call. */
export function loadOpeningBook(): Promise<OpeningBook> {
  loading ??= import('./openings.json').then(
    (m) => m.default as OpeningBook,
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}
