import { ChessComError } from './errors';
import type { Game, MonthKey, Profile, Side, TimeClass } from './types';

type Obj = Record<string, unknown>;

const TIME_CLASSES: readonly string[] = ['bullet', 'blitz', 'rapid', 'daily'];

function bad(): never {
  throw new ChessComError('bad-shape');
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

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function seconds(v: unknown): Date {
  return new Date(num(v) * 1000);
}

function side(v: unknown): Side {
  const o = obj(v);
  return {
    username: str(o.username),
    rating: num(o.rating),
    result: str(o.result),
  };
}

function accuracies(v: unknown): Game['accuracies'] {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Obj;
  return typeof o.white === 'number' && typeof o.black === 'number'
    ? { white: o.white, black: o.black }
    : undefined;
}

export function parseProfile(json: unknown): Profile {
  const o = obj(json);
  return {
    username: str(o.username),
    avatar: optStr(o.avatar),
    title: optStr(o.title),
    joined: seconds(o.joined),
  };
}

export function parseArchives(json: unknown): MonthKey[] {
  const urls = obj(json).archives;
  if (!Array.isArray(urls)) return bad();
  return urls
    .map((u) => {
      const m = /\/(\d{4})\/(\d{2})$/.exec(str(u));
      return m ? (`${m[1]}-${m[2]}` as MonthKey) : bad();
    })
    .reverse();
}

function parseGame(json: unknown): Game {
  const o = obj(json);
  const timeClass = str(o.time_class);
  if (!TIME_CLASSES.includes(timeClass)) bad();
  const url = str(o.url);
  return {
    id: url,
    site: 'chesscom',
    url,
    pgn: str(o.pgn),
    endedAt: seconds(o.end_time),
    timeControl: str(o.time_control),
    timeClass: timeClass as TimeClass,
    rated: o.rated === true,
    white: side(o.white),
    black: side(o.black),
    accuracies: accuracies(o.accuracies),
  };
}

// Only standard chess is analyzable. Variants (chess960, bughouse, ...) are dropped.
// A single malformed game is skipped so one odd record cannot hide a whole month.
export function parseMonth(json: unknown): Game[] {
  const games = obj(json).games;
  if (!Array.isArray(games)) return bad();
  const out: Game[] = [];
  for (const g of games) {
    if (obj(g).rules !== 'chess') continue;
    try {
      out.push(parseGame(g));
    } catch (e) {
      if (!(e instanceof ChessComError)) throw e;
    }
  }
  return out.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
}
