import { Chess } from 'chess.js';

import { parseReplay, type Ply, type Replay } from '@/lib/chess/replay';

/** Every way a shared link can fail to open. The message is for the reader. */
export class ShareError extends Error {
  override name = 'ShareError';
}

/** The headers the app reads. Everything else stays out of the link. */
const HEADERS = [
  'Event',
  'Site',
  'Date',
  'White',
  'Black',
  'WhiteElo',
  'BlackElo',
  'Result',
  'TimeControl',
  'ECOUrl',
  'Opening',
  'ECO',
  'Termination',
] as const;

const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
const MAX_TEXT_BYTES = 64 * 1024;
const STANDARD_START = new Chess().fen();

/** "1:02:03.4" for %clk, with the seconds' own decimals so a parse gives back the same number. */
function clockText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Number((seconds - h * 3600 - m * 60).toFixed(3));
  const [whole, frac] = String(s).split('.');
  const sec = whole!.padStart(2, '0') + (frac ? `.${frac}` : '');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
}

function movetext(plies: Ply[], result: string): string {
  const out: string[] = [];
  plies.forEach((ply, i) => {
    if (ply.color === 'w') out.push(`${ply.moveNumber}.`);
    else if (i === 0 || plies[i - 1]!.clock !== undefined)
      out.push(`${ply.moveNumber}...`);
    out.push(ply.san);
    if (ply.clock !== undefined) out.push(`{[%clk ${clockText(ply.clock)}]}`);
  });
  out.push(result);
  return out.join(' ');
}

/** A PGN with only what the review page reads, so the link stays short. */
function compactPgn(replay: Replay): string {
  const { headers, start, plies } = replay;
  // chess.js reads tag values literally, with no escapes, so they go out as they came in.
  const lines = HEADERS.filter((k) => headers[k] !== undefined).map(
    (k) => `[${k} "${headers[k]}"]`,
  );
  if (start !== STANDARD_START) lines.push('[SetUp "1"]', `[FEN "${start}"]`);
  const result = RESULTS.find((r) => r === headers.Result) ?? '*';
  return `${lines.join('\n')}\n\n${movetext(plies, result)}`;
}

async function drain(
  stream: ReadableStream<Uint8Array>,
  limit = Infinity,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      void reader.cancel();
      throw new ShareError('That link holds more than a game would.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function streamOf(
  bytes: Uint8Array<ArrayBuffer>,
): ReadableStream<BufferSource> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1)
    throw new ShareError(
      'That link is damaged, so its game data cannot be read.',
    );
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function encodeReplay(replay: Replay): Promise<string> {
  const text = new TextEncoder().encode(compactPgn(replay));
  const packed = await drain(
    streamOf(text).pipeThrough(new CompressionStream('deflate-raw')),
  );
  return toBase64Url(packed);
}

/** Reads a payload from a link: untrusted input, so it fails only with ShareError. */
export async function decodeReplay(payload: string): Promise<Replay> {
  const packed = fromBase64Url(payload);
  let text: string;
  try {
    const bytes = await drain(
      streamOf(packed).pipeThrough(new DecompressionStream('deflate-raw')),
      MAX_TEXT_BYTES,
    );
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError('That link is broken or was cut short.');
  }
  try {
    return parseReplay(text);
  } catch {
    throw new ShareError('That link does not hold a game this app can read.');
  }
}
