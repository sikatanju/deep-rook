// Which of the listed games the Games page shows and the batch review takes,
// by time control and result. Pure, so the page only has to draw it.

import { outcomeFor, type Outcome } from './session';
import type { Game, TimeClass } from './types';

/** Every time control, quickest first. */
export const SPEEDS: readonly TimeClass[] = [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'daily',
];

export type ListFilter = {
  speed: TimeClass | 'all';
  /** From the listed player's side. */
  result: Outcome | 'all';
};

export const NO_LIST_FILTER: ListFilter = { speed: 'all', result: 'all' };

export const isFiltering = ({ speed, result }: ListFilter) =>
  speed !== 'all' || result !== 'all';

/** The games that pass `filter`, in the order given; the result is `username`'s. */
export function filterListed(
  games: readonly Game[],
  { speed, result }: ListFilter,
  username: string,
): Game[] {
  return games.filter(
    (g) =>
      (speed === 'all' || g.timeClass === speed) &&
      (result === 'all' || outcomeFor(g, username).outcome === result),
  );
}
