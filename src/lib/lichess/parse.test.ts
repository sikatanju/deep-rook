import { expect, test } from 'vitest';

import { outcomeFor } from '@/lib/chesscom/session';
import { openingName, parseReplay } from '@/lib/chess/replay';

import {
  ABORTED,
  BLITZ,
  CHESS960,
  CORRESPONDENCE,
  DRAW,
  ndjson,
  VS_AI,
} from './fixtures';
import { parseGames } from './parse';

test('maps a game to the site-neutral shape', () => {
  const { games } = parseGames(ndjson(BLITZ));
  expect(games).toEqual([
    {
      id: 'jiqHI3gX',
      site: 'lichess',
      url: 'https://lichess.org/jiqHI3gX',
      pgn: BLITZ.pgn,
      endedAt: new Date(1790862224955),
      timeControl: '300+3',
      timeClass: 'blitz',
      rated: true,
      white: { username: 'krevermann', rating: 1624, result: 'loss' },
      black: { username: 'thibault', rating: 1742, result: 'win' },
    },
  ]);
});

test('wins, losses and draws read the same as Chess.com games', () => {
  const [win, draw] = parseGames(ndjson(BLITZ, DRAW)).games;
  expect(outcomeFor(win!, 'thibault').outcome).toBe('win');
  expect(outcomeFor(win!, 'krevermann').outcome).toBe('loss');
  expect(outcomeFor(draw!, 'thibault').outcome).toBe('draw');
  expect(outcomeFor(draw!, 'martin99991').outcome).toBe('draw');
});

test('maps every speed onto the four time classes', () => {
  const speeds = {
    ultraBullet: 'bullet',
    bullet: 'bullet',
    blitz: 'blitz',
    rapid: 'rapid',
    classical: 'rapid',
    correspondence: 'daily',
  };
  for (const [speed, timeClass] of Object.entries(speeds)) {
    const [game] = parseGames(ndjson({ ...BLITZ, speed })).games;
    expect(game?.timeClass).toBe(timeClass);
  }
});

test('writes days per move like Chess.com', () => {
  const [game] = parseGames(ndjson(CORRESPONDENCE)).games;
  expect(game).toMatchObject({ timeControl: '1/1209600', timeClass: 'daily' });
});

test('drops variants, unplayed games and games without two accounts', () => {
  const page = parseGames(
    ndjson(
      BLITZ,
      VS_AI,
      CHESS960,
      ABORTED,
      { ...BLITZ, id: 'live', status: 'started' },
      { ...BLITZ, id: 'never', status: 'noStart' },
      {
        ...BLITZ,
        id: 'anon',
        players: { white: { rating: 1500 }, black: BLITZ.players.black },
      },
      DRAW,
    ),
  );
  expect(page.games.map((g) => g.id)).toEqual(['jiqHI3gX', 'sgLDzWna']);
});

test('skips a malformed line and keeps the rest', () => {
  const page = parseGames(
    ndjson(
      BLITZ,
      '{"id": "cut',
      { ...BLITZ, id: 'nopgn', pgn: undefined },
      DRAW,
    ),
  );
  expect(page.games.map((g) => g.id)).toEqual(['jiqHI3gX', 'sgLDzWna']);
});

test('counts every line and finds the oldest createdAt, dropped games included', () => {
  const page = parseGames(ndjson(BLITZ, '{bad', DRAW, ABORTED));
  expect(page.lines).toBe(4);
  expect(page.oldestCreatedAt).toBe(ABORTED.createdAt);
  expect(parseGames('')).toEqual({
    games: [],
    lines: 0,
    oldestCreatedAt: null,
  });
});

test('the PGN Lichess sends replays, opening included', () => {
  const [game] = parseGames(ndjson(BLITZ)).games;
  const replay = parseReplay(game!.pgn);
  expect(replay.plies).toHaveLength(10);
  expect(replay.plies.at(-1)).toMatchObject({ san: 'Nc6', clock: 260 });
  expect(replay.headers).toMatchObject({
    White: 'krevermann',
    Black: 'thibault',
  });
  expect(openingName(replay.headers)).toBe(
    "Queen's Gambit Declined: Austrian Defense",
  );
});
