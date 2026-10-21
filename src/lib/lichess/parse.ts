import type { Game, Side, TimeClass } from '@/lib/chesscom/types';

import { LichessError } from './errors';

type Obj = Record<string, unknown>;

const TIME_CLASSES: Record<string, TimeClass> = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'rapid',
  correspondence: 'daily',
};

/** Statuses of games that never really started, so there is nothing to review. */
const UNPLAYED = new Set(['created', 'started', 'aborted', 'noStart']);

function bad(): never {
  throw new LichessError('bad-shape');
}

function obj(v: unknown): Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Obj)
    : bad();
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : bad();
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : bad();
}

/** In Chess.com's notation: "600+0" for a clock, "1/86400" for days per move. */
function timeControl(o: Obj): string {
  if (o.clock !== undefined) {
    const clock = obj(o.clock);
    return `${num(clock.initial)}+${num(clock.increment)}`;
  }
  if (o.daysPerTurn !== undefined) return `1/${num(o.daysPerTurn) * 86400}`;
  return '-';
}

function side(v: unknown, color: 'white' | 'black', winner: unknown): Side {
  const o = obj(v);
  return {
    username: str(obj(o.user).name),
    rating: num(o.rating),
    result: winner === color ? 'win' : winner === undefined ? 'draw' : 'loss',
  };
}

/** One game in Lichess's export shape; null for one there is nothing to review in. */
function parseGame(json: unknown): Game | null {
  const o = obj(json);
  if (o.variant !== 'standard' || UNPLAYED.has(str(o.status))) return null;
  const players = obj(o.players);
  const white = obj(players.white);
  const black = obj(players.black);
  // Anonymous players and the Lichess AI have no user, so no one to review as.
  if (white.user === undefined || black.user === undefined) return null;
  const timeClass = TIME_CLASSES[str(o.speed)] ?? bad();
  const id = str(o.id);
  return {
    id,
    site: 'lichess',
    url: `https://lichess.org/${id}`,
    pgn: str(o.pgn),
    endedAt: new Date(num(o.lastMoveAt)),
    timeControl: timeControl(o),
    timeClass,
    rated: o.rated === true,
    white: side(white, 'white', o.winner),
    black: side(black, 'black', o.winner),
  };
}

export type ParsedPage = {
  /** Newest first, as Lichess sends them. */
  games: Game[];
  /** Every line in the body, kept or not. */
  lines: number;
  /** `createdAt` of the oldest game in the body, kept or not; null when none had one. */
  oldestCreatedAt: number | null;
};

// The page cursor counts dropped games too: a page made only of variants
// would otherwise look like the end of the history.
// A malformed line is skipped so one odd record cannot hide a whole page.
export function parseGames(ndjson: string): ParsedPage {
  const games: Game[] = [];
  let lines = 0;
  let oldestCreatedAt: number | null = null;
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue;
    lines++;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const createdAt = (json as Obj | null)?.createdAt;
    if (typeof createdAt === 'number')
      oldestCreatedAt = Math.min(oldestCreatedAt ?? createdAt, createdAt);
    try {
      const game = parseGame(json);
      if (game) games.push(game);
    } catch (e) {
      if (!(e instanceof LichessError)) throw e;
    }
  }
  return { games, lines, oldestCreatedAt };
}
