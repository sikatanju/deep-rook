import type { ChessComErrorKind } from '@/lib/chesscom/errors';

export type LichessErrorKind = ChessComErrorKind;

export class LichessError extends Error {
  constructor(readonly kind: LichessErrorKind) {
    super(kind);
    this.name = 'LichessError';
  }
}

export const lichessErrorMessages: Record<LichessErrorKind, string> = {
  'not-found': 'No Lichess player with that username.',
  'no-games': 'This player has no games to show.',
  'rate-limited': 'Lichess is rate limiting us. Try again in a minute.',
  gone: 'Lichess no longer serves this data.',
  network: 'Could not reach Lichess. Check your connection.',
  'bad-shape': 'Lichess sent data we did not understand.',
};
