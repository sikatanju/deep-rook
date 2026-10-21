import { expect, test } from 'vitest';

import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';

import { openShare, readShareParams, shareUrl, ShareError } from './link';
import { decodeReplay, encodeReplay } from './payload';

const CLOCKED = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.01.04"]
[White "Me"]
[Black "Rival"]
[Result "0-1"]
[WhiteElo "1500"]
[BlackElo "1490"]
[TimeControl "180+2"]
[ECOUrl "https://www.chess.com/openings/Kings-Pawn-Opening"]
[Termination "Rival won on time"]
[Link "https://www.chess.com/game/live/1"]

1. e4 {[%clk 0:03:01.9]} 1... e5 {[%clk 0:02:59.3]} 2. Nf3 {[%clk 1:02:03.4]} 2... Nc6 {[%clk 0:00:05]} 3. Bb5 {[%clk 0:00:00.1]} 0-1`;

const CUSTOM_START = `[White "Alice"]
[Black "Bob [the] {Rook} \\o/"]
[SetUp "1"]
[FEN "r2q1rk1/pppp1ppp/8/8/4P3/8/PPP2PPP/R2Q1RK1 b - - 0 20"]

20... d5 {[%clk 0:01:00]} 21. exd5 21... Qxd5 {[%clk 0:00:50]} *`;

async function roundTrip(pgn: string) {
  const replay = parseReplay(pgn);
  return { replay, back: await decodeReplay(await encodeReplay(replay)) };
}

test('the Opera Game survives a round trip, and its link is short', async () => {
  const { replay, back } = await roundTrip(OPERA_GAME);
  expect(back).toEqual(replay);
  const url = await shareUrl(replay, 'w', 'https://deeprook.example/');
  expect(url.length).toBeLessThan(450);
});

test('a clocked game keeps every clock and the headers the app reads', async () => {
  const { replay, back } = await roundTrip(CLOCKED);
  expect(back.plies.map((p) => p.clock)).toEqual([
    181.9, 179.3, 3723.4, 5, 0.1,
  ]);
  expect(back.plies).toEqual(replay.plies);
  expect(back.start).toBe(replay.start);
  expect(back.headers).toEqual({ ...replay.headers, Link: undefined });
  expect(back.headers).not.toHaveProperty('Link');
});

test('a game from a custom position keeps its start and odd names', async () => {
  const { replay, back } = await roundTrip(CUSTOM_START);
  expect(back.start).toBe(
    'r2q1rk1/pppp1ppp/8/8/4P3/8/PPP2PPP/R2Q1RK1 b - - 0 20',
  );
  expect(back.plies).toEqual(replay.plies);
  expect(back.headers.Black).toBe('Bob [the] {Rook} \\o/');
});

async function deflate(bytes: Uint8Array<ArrayBuffer>) {
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function rejects(payload: string) {
  await expect(decodeReplay(payload)).rejects.toBeInstanceOf(ShareError);
}

test('bad payloads fail as ShareError with a readable message', async () => {
  const good = await encodeReplay(parseReplay(OPERA_GAME));

  await rejects('not base64!');
  await rejects('abcde');
  await rejects(good.slice(0, Math.floor(good.length / 2)));
  const middle = Math.floor(good.length / 2);
  const flipped = good[middle] === 'A' ? 'B' : 'A';
  await rejects(good.slice(0, middle) + flipped + good.slice(middle + 1));
  await rejects(
    base64url(await deflate(new TextEncoder().encode('just some words'))),
  );

  const error = await decodeReplay('%%%').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ShareError);
  expect((error as ShareError).message).toMatch(/link/);
});

test('a decompression bomb stops at the size cap', async () => {
  const bomb = base64url(await deflate(new Uint8Array(8 * 1024 * 1024)));
  expect(bomb.length).toBeLessThan(20_000);
  const error = await decodeReplay(bomb).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ShareError);
  expect((error as ShareError).message).toMatch(/more than a game/);
});

test('a link names its version, game, and side, and refuses other versions', async () => {
  const replay = parseReplay(OPERA_GAME);
  const url = new URL(await shareUrl(replay, 'b', 'https://x.example/app/'));
  expect(url.pathname).toBe('/app/');
  const [route, query] = url.hash.slice(1).split('?');
  expect(route).toBe('/review');
  const params = readShareParams(query!)!;
  expect(params).toMatchObject({ v: '1', side: 'b' });
  expect(await openShare(params)).toEqual(replay);

  await expect(openShare({ ...params, v: '2' })).rejects.toBeInstanceOf(
    ShareError,
  );
  await expect(openShare({ ...params, v: '' })).rejects.toBeInstanceOf(
    ShareError,
  );
});

test('a missing or odd side means White at the bottom; no game means no link', () => {
  expect(readShareParams('v=1&g=abc')).toEqual({ v: '1', g: 'abc', side: 'w' });
  expect(readShareParams('?v=1&g=abc&side=x')!.side).toBe('w');
  expect(readShareParams('v=1')).toBeNull();
  expect(readShareParams('')).toBeNull();
});
