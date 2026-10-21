import type { Replay } from '@/lib/chess/replay';

import { decodeReplay, encodeReplay, ShareError } from './payload';

export { ShareError } from './payload';

const VERSION = '1';

export type Side = 'w' | 'b';

/** What a review link carries, still undecoded. */
export type ShareParams = { v: string; g: string; side: Side };

/** `base` is the page's address without the hash, e.g. origin + pathname. */
export async function shareUrl(
  replay: Replay,
  orientation: Side,
  base: string,
): Promise<string> {
  const query = new URLSearchParams({
    v: VERSION,
    g: await encodeReplay(replay),
    side: orientation,
  });
  return `${base}#/review?${query}`;
}

/** The share fields of a hash query, or null when it carries no game. */
export function readShareParams(
  search: string | URLSearchParams,
): ShareParams | null {
  const params = new URLSearchParams(search);
  const g = params.get('g');
  if (g === null) return null;
  const side = params.get('side') === 'b' ? 'b' : 'w';
  return { v: params.get('v') ?? '', g, side };
}

export async function openShare(params: ShareParams): Promise<Replay> {
  if (params.v !== VERSION)
    throw new ShareError(
      'That link was made by a different version of DeepRook.',
    );
  return decodeReplay(params.g);
}
