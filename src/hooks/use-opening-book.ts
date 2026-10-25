import { useEffect, useState } from 'react';

import { loadOpeningBook, type OpeningBook } from '@/lib/chess/openings';

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
