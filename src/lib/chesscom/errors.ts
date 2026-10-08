export type ChessComErrorKind =
  'not-found' | 'no-games' | 'rate-limited' | 'gone' | 'network' | 'bad-shape';

export class ChessComError extends Error {
  constructor(readonly kind: ChessComErrorKind) {
    super(kind);
    this.name = 'ChessComError';
  }
}

export const errorMessages: Record<ChessComErrorKind, string> = {
  'not-found': 'No Chess.com player with that username.',
  'no-games': 'This player has no games to show.',
  'rate-limited': 'Chess.com is rate limiting us. Try again in a minute.',
  gone: 'Chess.com no longer serves this data.',
  network: 'Could not reach Chess.com. Check your connection.',
  'bad-shape': 'Chess.com sent data we did not understand.',
};
