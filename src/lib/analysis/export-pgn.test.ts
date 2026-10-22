import { expect, test } from 'vitest';

import { parseReplay } from '@/lib/chess/replay';

import { annotatedPgn, pgnFilename } from './export-pgn';
import { OPERA_SLIPS, stored } from './fixtures';
import type { GameAnalysis, PositionAnalysis } from './game-analysis';

/** The analysis document of a fixture record, every position settled. */
function analysisOf(
  record = stored(OPERA_SLIPS),
  patch: Record<number, PositionAnalysis> = {},
): GameAnalysis {
  const positions = record.lines.map(
    (line, i): PositionAnalysis => patch[i] ?? { status: 'done', line },
  );
  return {
    gameId: 1,
    level: record.level,
    positions,
    done: positions.length,
    unavailable: false,
  };
}

const exportOf = (patch: Record<number, PositionAnalysis> = {}) => {
  const record = stored(OPERA_SLIPS);
  return annotatedPgn(record.replay, analysisOf(record, patch));
};

test('writes the seven tag roster, then the other headers, then the movetext', () => {
  const pgn = exportOf();
  expect(pgn.split('\n\n')[0]).toBe(
    [
      '[Event "Paris"]',
      '[Site "Paris FRA"]',
      '[Date "1858.??.??"]',
      '[Round "?"]',
      '[White "Paul Morphy"]',
      '[Black "Duke Karl / Count Isouard"]',
      '[Result "1-0"]',
      '[WhiteElo "2690"]',
      '[BlackElo "2400"]',
      '[Annotator "DeepRook"]',
    ].join('\n'),
  );
  expect(pgn.endsWith(' 17. Rd8# {[%eval 9.00]} 1-0\n')).toBe(true);
});

test('a blunder carries its glyph, its eval and the engine move', () => {
  const pgn = exportOf().replace(/\n/g, ' ');
  expect(pgn).toContain(
    '4. dxe5 {[%eval 0.00]} 4... Bxf3 $4 {[%eval 4.00] Blunder. Best was dxe5.}',
  );
  expect(pgn).toContain('7... Qe7 $2 {[%eval 9.00] Mistake. Best was Nc6.}');
});

test('opens with the level and each side’s estimated accuracy', () => {
  const body = exportOf().split('\n\n')[1]!;
  expect(body).toMatch(
    /^\{DeepRook review at Balanced\. Estimated accuracy White 100\.0, Black \d+\.\d\.\}/,
  );
});

test('a position still being searched gets no eval', () => {
  const pgn = exportOf({ 8: { status: 'searching', line: null } }).replace(
    /\n/g,
    ' ',
  );
  expect(pgn).toContain('4... Bxf3 ');
  expect(pgn).not.toContain('4... Bxf3 $4');
  expect(pgn).not.toContain('Blunder.');
});

test('mate reads as #n for White and #-n for Black, and the board’s own mate is left out', () => {
  const line = (winner: 'w' | 'b', moves: number) =>
    ({
      status: 'done',
      line: { score: { kind: 'mate', winner, moves }, pv: ['a2a3'], depth: 12 },
    }) as const;
  const pgn = exportOf({
    31: line('w', 2),
    32: line('b', 1),
    33: line('w', 0),
  }).replace(/\n/g, ' ');
  expect(pgn).toContain('16. Qb8+ {[%eval #2]} 16... Nxb8 {[%eval #-1]}');
  expect(pgn).toContain('17. Rd8# 1-0');
});

test('keeps the clocks the game came with', () => {
  const replay = parseReplay(
    '[White "a"]\n[Black "b"]\n[Result "*"]\n\n1. d4 {[%clk 0:03:00]} 1... d5 {[%clk 0:02:58.5]} 2. c4 *',
  );
  const record = stored({ replay });
  const pgn = annotatedPgn(replay, analysisOf(record)).replace(/\n/g, ' ');
  expect(pgn).toContain('1. d4 {[%eval 0.00] [%clk 0:03:00]}');
  expect(pgn).toContain('1... d5 {[%eval 0.00] [%clk 0:02:58.5]}');
});

test('no line runs past 80 columns and no comment spans two lines', () => {
  const lines = exportOf().split('\n');
  expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(80);
  for (const line of lines.filter((l) => !l.startsWith('['))) {
    expect(line.split('{').length).toBe(line.split('}').length);
  }
});

test('a PGN parser reads the export back as the same game', () => {
  const record = stored(OPERA_SLIPS);
  const back = parseReplay(annotatedPgn(record.replay, analysisOf(record)));
  expect(back.plies.map((p) => p.san)).toEqual(
    record.replay.plies.map((p) => p.san),
  );
  expect(back.headers).toMatchObject({
    White: 'Paul Morphy',
    Black: 'Duke Karl / Count Isouard',
    Result: '1-0',
    Annotator: 'DeepRook',
  });
});

test('a game from a custom position keeps its start', () => {
  const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
  const replay = parseReplay(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4 Kd7 *`);
  const record = stored({ replay });
  const pgn = annotatedPgn(replay, analysisOf(record));
  expect(pgn).toContain(`[SetUp "1"]\n[FEN "${fen}"]`);
  expect(parseReplay(pgn).start).toBe(fen);
});

test('names the file after the players', () => {
  expect(
    pgnFilename({ White: 'Paul Morphy', Black: 'Duke Karl / Count' }),
  ).toBe('paul-morphy-vs-duke-karl-count.pgn');
  expect(pgnFilename({ White: '?', Black: 'Bob' })).toBe('game.pgn');
  expect(pgnFilename({})).toBe('game.pgn');
});
