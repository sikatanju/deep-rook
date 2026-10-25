import { Chess, type Square } from 'chess.js';

export type Ply = {
  fen: string;
  san: string;
  from: Square;
  to: Square;
  check: boolean;
  /** The side that played this ply. */
  color: 'w' | 'b';
  /** Fullmove number of the position this ply is played from, 20 for "20… d5". */
  moveNumber: number;
  /** Seconds left on the mover's clock after this ply, when the PGN has %clk. */
  clock?: number;
};

export type Replay = {
  headers: Record<string, string>;
  start: string;
  plies: Ply[];
};

const CLOCK = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/;

function clockSeconds(comment: string | undefined): number | undefined {
  const m = comment ? CLOCK.exec(comment) : null;
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

/** Parses a PGN into positions. Throws an Error with a readable message. */
export function parseReplay(pgn: string): Replay {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : 'That does not look like a valid PGN.',
    );
  }
  const clocks = new Map(
    chess.getComments().map((c) => [c.fen, clockSeconds(c.comment)]),
  );
  const moves = chess.history({ verbose: true });
  if (moves.length === 0) throw new Error('That PGN has no moves.');
  const headers = Object.fromEntries(
    Object.entries(chess.getHeaders()).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
  return {
    headers,
    start: moves[0]!.before,
    plies: moves.map((m) => ({
      fen: m.after,
      san: m.san,
      from: m.from,
      to: m.to,
      check: m.san.endsWith('+') || m.san.endsWith('#'),
      color: m.color,
      moveNumber: Number(m.before.split(' ')[5]),
      clock: clocks.get(m.after),
    })),
  };
}

export function fenAt(replay: Replay, index: number): string {
  return index === 0 ? replay.start : replay.plies[index - 1]!.fen;
}

const START_COUNTS: Record<string, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
};
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

export type Material = {
  /** Pieces each side has lost, keyed by the side that lost them. */
  lost: { w: string[]; b: string[] };
  /** Positive when white is ahead. */
  balance: number;
};

export function materialOf(fen: string): Material {
  const board = fen.split(' ')[0]!;
  const lost = { w: [] as string[], b: [] as string[] };
  let balance = 0;
  for (const side of ['w', 'b'] as const) {
    for (const type of ['q', 'r', 'b', 'n', 'p']) {
      const letter = side === 'w' ? type.toUpperCase() : type;
      const have = [...board].filter((c) => c === letter).length;
      for (let i = have; i < START_COUNTS[type]!; i++) lost[side].push(type);
      balance += (side === 'w' ? 1 : -1) * have * VALUE[type]!;
    }
  }
  return { lost, balance };
}

/**
 * "Sicilian Defense" from a Chess.com ECOUrl like .../openings/Sicilian-Defense-2.Nf3,
 * else the Opening header that Lichess and most PGN tools write.
 */
export function openingName(headers: Record<string, string>): string | null {
  const slug = headers.ECOUrl?.split('/openings/')[1];
  if (slug) return slug.split(/-\d/)[0]!.replace(/-/g, ' ');
  return headers.Opening?.trim() || null;
}

/** The game's page: the Link header Chess.com writes, else the Site URL Lichess writes. */
export function gameLink(headers: Record<string, string>): string | null {
  const link = headers.Link ?? headers.Site;
  return link?.startsWith('https://') ? link : null;
}

/** "1:02:03.4" for %clk, with the seconds' own decimals so a parse gives back the same number. */
export function clockText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Number((seconds - h * 3600 - m * 60).toFixed(3));
  const [whole, frac] = String(s).split('.');
  const sec = whole!.padStart(2, '0') + (frac ? `.${frac}` : '');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const sec = s < 20 && h === 0 && m === 0 ? rest.toFixed(1) : Math.floor(rest);
  const pad = String(sec).padStart(s < 20 && !h && !m ? 4 : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${pad}` : `${m}:${pad}`;
}

export const OPERA_GAME = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[WhiteElo "2690"]
[BlackElo "2400"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

/** UCI moves played from `fen`, as SAN. Stops at the first move that does not apply. */
export function sanLine(fen: string, uci: readonly string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const m of uci) {
    try {
      out.push(
        chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
          .san,
      );
    } catch {
      break;
    }
  }
  return out;
}

/**
 * `sans` played from `fen`, numbered the way a score sheet reads: "12… Nf6"
 * for Black's move opening the list, "13. Bd3" for White's, bare after that.
 */
export function numberedSan(fen: string, sans: readonly string[]): string[] {
  const fields = fen.split(' ');
  let number = Number(fields[5]);
  let white = fields[1] === 'w';
  return sans.map((san, i) => {
    const text = white
      ? `${number}. ${san}`
      : i === 0
        ? `${number}… ${san}`
        : san;
    if (!white) number++;
    white = !white;
    return text;
  });
}
