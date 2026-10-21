export type Username = string & { readonly __brand: 'Username' };
export type MonthKey = `${number}-${string}`;

/** Where a game was played. */
export type Site = 'chesscom' | 'lichess';

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';

export type Side = { username: string; rating: number; result: string };

export type Game = {
  id: string;
  url: string;
  pgn: string;
  endedAt: Date;
  timeControl: string;
  timeClass: TimeClass;
  rated: boolean;
  white: Side;
  black: Side;
  accuracies?: { white: number; black: number };
};

export type Profile = {
  username: string;
  avatar?: string;
  title?: string;
  joined: Date;
};

export function toUsername(raw: string): Username {
  return raw.trim().toLowerCase() as Username;
}
