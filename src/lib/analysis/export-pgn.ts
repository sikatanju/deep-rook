// The reviewed game as a PGN other tools can read. Lichess takes the [%eval]
// and [%clk] comment commands; ChessBase and the rest show the sentences and
// the numeric glyphs. Pure over one analysis snapshot, so a position the
// engine has not settled just gets no eval.

import { Chess } from 'chess.js';

import { clockText, fenAt, sanLine, type Replay } from '@/lib/chess/replay';
import type { Score } from '@/lib/chess/score';

import {
  CLASSIFICATIONS,
  classifyMoves,
  type Classification,
} from './classify';
import { explainMove } from './explain';
import type { GameAnalysis } from './game-analysis';
import { ANALYSIS_LEVELS } from './levels';
import { gameReport } from './report';

/**
 * What a grade adds to its move. `nag` is the numeric annotation glyph, and
 * `best` names the engine's move when it differs. Grades left out (best,
 * excellent, good) are only an eval.
 */
const MARKS: Partial<Record<Classification, { nag?: number; best?: true }>> = {
  brilliant: { nag: 3 },
  great: { nag: 1 },
  inaccuracy: { nag: 6, best: true },
  mistake: { nag: 2, best: true },
  miss: { best: true },
  blunder: { nag: 4, best: true },
};

const ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
const OWNED = ['SetUp', 'FEN', 'Annotator'];
const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
const STANDARD_START = new Chess().fen();
const LINE_WIDTH = 80;

/** "0.35", "-1.20", "#3" for White mating in 3, "#-3" for Black. Null on the board's mate. */
function evalText(score: Score): string | null {
  if (score.kind === 'cp') return (score.cp / 100).toFixed(2);
  if (score.moves === 0) return null;
  return `#${score.winner === 'w' ? '' : '-'}${score.moves}`;
}

function headerBlock(replay: Replay, result: string): string {
  const { headers, start } = replay;
  const tags: [string, string][] = ROSTER.map((k) => [
    k,
    k === 'Result' ? result : (headers[k] ?? '?'),
  ]);
  for (const [k, v] of Object.entries(headers)) {
    if (!ROSTER.includes(k) && !OWNED.includes(k)) tags.push([k, v]);
  }
  tags.push(['Annotator', 'DeepRook']);
  if (start !== STANDARD_START) tags.push(['SetUp', '1'], ['FEN', start]);
  // chess.js reads tag values literally, with no escapes, so they go out as they came in.
  return tags.map(([k, v]) => `[${k} "${v}"]`).join('\n');
}

function leadComment(
  analysis: GameAnalysis,
  report: ReturnType<typeof gameReport>,
) {
  const accuracy = (name: string, a: number | null) =>
    a === null ? [] : [`${name} ${a.toFixed(1)}`];
  const both = [
    ...accuracy('White', report.white.accuracy),
    ...accuracy('Black', report.black.accuracy),
  ];
  const level = `DeepRook review at ${ANALYSIS_LEVELS[analysis.level].label}.`;
  return both.length
    ? `${level} Estimated accuracy ${both.join(', ')}.`
    : level;
}

/**
 * The game with an `[%eval]` after every settled position, the clocks it
 * came with, a numeric glyph and a sentence on notable grades, and the
 * engine's move where the player's was worse. Evals are White's view in
 * pawns, as Lichess writes them.
 */
export function annotatedPgn(replay: Replay, analysis: GameAnalysis): string {
  const { positions } = analysis;
  const grades = classifyMoves(replay, positions);
  const report = gameReport(replay, positions, grades);
  const result = RESULTS.find((r) => r === replay.headers.Result) ?? '*';

  const tokens = [`{${leadComment(analysis, report)}}`];
  let commented = true;
  replay.plies.forEach((ply, p) => {
    if (ply.color === 'w') tokens.push(`${ply.moveNumber}.`);
    else if (commented) tokens.push(`${ply.moveNumber}...`);
    tokens.push(ply.san);

    const grade = grades[p];
    const mark = grade ? MARKS[grade] : undefined;
    if (mark?.nag) tokens.push(`$${mark.nag}`);

    const comment: string[] = [];
    const after = positions[p + 1];
    const score = after?.status === 'done' ? evalText(after.line.score) : null;
    if (score) comment.push(`[%eval ${score}]`);
    if (ply.clock !== undefined) comment.push(`[%clk ${clockText(ply.clock)}]`);
    if (grade && mark) {
      const before = positions[p];
      const settled = before?.status === 'done' ? before.line : null;
      const best =
        mark.best && settled
          ? sanLine(fenAt(replay, p), settled.pv.slice(0, 1))[0]
          : undefined;
      const why =
        settled && after?.status === 'done'
          ? explainMove(grade, fenAt(replay, p), ply, settled, after.line)
          : null;
      comment.push(
        `${CLASSIFICATIONS[grade].label}.`,
        ...(why ? [`${why[0]!.toUpperCase()}${why.slice(1)}.`] : []),
        ...(best && best !== ply.san ? [`Best was ${best}.`] : []),
      );
    }
    commented = comment.length > 0;
    if (commented) tokens.push(`{${comment.join(' ')}}`);
  });
  tokens.push(result);

  return `${headerBlock(replay, result)}\n\n${wrap(tokens)}\n`;
}

/** Breaks lines between tokens only, so a comment never spans two lines. */
function wrap(tokens: string[]): string {
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > LINE_WIDTH) {
      lines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  }
  lines.push(line);
  return lines.join('\n');
}

/** "paul-morphy-vs-duke-karl-count-isouard.pgn", or "game.pgn" when a name has no letters. */
export function pgnFilename(headers: Record<string, string>): string {
  const slug = (name = '') =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const white = slug(headers.White);
  const black = slug(headers.Black);
  return white && black ? `${white}-vs-${black}.pgn` : 'game.pgn';
}
