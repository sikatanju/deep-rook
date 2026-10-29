import { useEffect, useMemo, useState } from 'react';

import {
  loadOpeningBook,
  openingOf,
  type Opening,
  type OpeningBook,
} from '@/lib/chess/openings';
import type { Replay } from '@/lib/chess/replay';

/**
 * The opening table: undefined while it loads, null if it could not load
 * (opening names then come from the PGN headers alone).
 */
export function useOpeningBook(): OpeningBook | null | undefined {
  const [book, setBook] = useState<OpeningBook | null>();
  useEffect(() => {
    let current = true;
    loadOpeningBook().then(
      (loaded) => current && setBook(loaded),
      () => current && setBook(null),
    );
    return () => {
      current = false;
    };
  }, []);
  return book;
}

/**
 * The game's opening from the table, which loads on first use. Null while it
 * loads, if it could not load, and for a game it does not name (a custom
 * start, say).
 */
export function useOpening(replay: Replay): Opening | null {
  const book = useOpeningBook();
  return useMemo(() => (book ? openingOf(replay, book) : null), [replay, book]);
}
