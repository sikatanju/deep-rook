// Lines in the shape lichess.org/api/games/user sends, trimmed from real games.

const PGN_BLITZ = `[Event "rated blitz game"]
[Site "https://lichess.org/jiqHI3gX"]
[Date "2026.10.01"]
[Round "-"]
[White "krevermann"]
[Black "thibault"]
[Result "0-1"]
[GameId "jiqHI3gX"]
[UTCDate "2026.10.01"]
[UTCTime "13:42:38"]
[WhiteElo "1624"]
[BlackElo "1742"]
[WhiteRatingDiff "-4"]
[BlackRatingDiff "+4"]
[Variant "Standard"]
[TimeControl "300+3"]
[ECO "D06"]
[Opening "Queen's Gambit Declined: Austrian Defense"]
[Termination "Time forfeit"]

1. d4 { [%clk 0:05:00] } 1... d5 { [%clk 0:05:00] } 2. c4 { [%clk 0:05:02] } 2... c5 { [%clk 0:05:01] } 3. Nc3 { [%clk 0:05:03] } 3... cxd4 { [%clk 0:04:47] } 4. Qxd4 { [%clk 0:05:04] } 4... Nf6 { [%clk 0:04:24] } 5. cxd5 { [%clk 0:05:02] } 5... Nc6 { [%clk 0:04:20] } 0-1


`;

const PGN_DRAW = `[Event "rated blitz game"]
[Site "https://lichess.org/sgLDzWna"]
[White "Martin99991"]
[Black "thibault"]
[Result "1/2-1/2"]
[Variant "Standard"]
[TimeControl "300+3"]
[Opening "English Opening: Anglo-Indian Defense, Queen's Knight Variation"]

1. c4 Nf6 2. Nc3 c5 1/2-1/2


`;

const PGN_CORRESPONDENCE = `[Event "casual correspondence game"]
[Site "https://lichess.org/o7vEsE3N"]
[White "neio"]
[Black "thibault"]
[Result "0-1"]
[Variant "Standard"]
[TimeControl "-"]
[Opening "King's Gambit Declined: Panteldakis Countergambit"]

1. e4 e5 2. f4 f5 0-1


`;

const thibault = { user: { name: 'thibault', id: 'thibault' } };

export const BLITZ = {
  id: 'jiqHI3gX',
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  perf: 'blitz',
  createdAt: 1790862158222,
  lastMoveAt: 1790862224955,
  status: 'timeout',
  source: 'pool',
  players: {
    white: {
      user: { name: 'krevermann', id: 'krevermann' },
      rating: 1624,
      ratingDiff: -4,
    },
    black: { ...thibault, rating: 1742, ratingDiff: 4 },
  },
  winner: 'black',
  moves: 'd4 d5 c4 c5 Nc3 cxd4 Qxd4 Nf6 cxd5 Nc6',
  pgn: PGN_BLITZ,
  clock: { initial: 300, increment: 3, totalTime: 420 },
};

export const DRAW = {
  id: 'sgLDzWna',
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  perf: 'blitz',
  createdAt: 1790613570235,
  lastMoveAt: 1790614535900,
  status: 'draw',
  source: 'pool',
  players: {
    white: { user: { name: 'Martin99991', id: 'martin99991' }, rating: 1840 },
    black: { ...thibault, rating: 1737 },
  },
  moves: 'c4 Nf6 Nc3 c5',
  pgn: PGN_DRAW,
  clock: { initial: 300, increment: 3, totalTime: 420 },
};

export const CORRESPONDENCE = {
  id: 'o7vEsE3N',
  rated: false,
  variant: 'standard',
  speed: 'correspondence',
  perf: 'correspondence',
  createdAt: 1761638682000,
  lastMoveAt: 1761725082000,
  status: 'resign',
  source: 'friend',
  daysPerTurn: 14,
  players: {
    white: { user: { name: 'neio', id: 'neio' }, rating: 1500 },
    black: { ...thibault, rating: 1942 },
  },
  winner: 'black',
  moves: 'e4 e5 f4 f5',
  pgn: PGN_CORRESPONDENCE,
};

export const VS_AI = {
  ...BLITZ,
  id: 'lZmYVpIl',
  createdAt: 1790000000000,
  players: { white: BLITZ.players.white, black: { aiLevel: 3 } },
};

export const CHESS960 = {
  ...BLITZ,
  id: 'c960aaaa',
  variant: 'chess960',
  createdAt: 1789000000000,
};

export const ABORTED = {
  ...BLITZ,
  id: 'abrtaaaa',
  status: 'aborted',
  createdAt: 1788000000000,
};

export const ndjson = (...lines: (object | string)[]) =>
  lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') +
  '\n';
