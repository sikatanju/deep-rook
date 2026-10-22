// One match worker: plays both colours of each assigned opening, new vs base,
// at a fixed node count per move so a result does not depend on machine load.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

import { Chess } from 'chess.js';

const { newPath, basePath, openings, nodes } = workerData;
const fresh = (await import(pathToFileURL(newPath).href)).createEngine();
const base = (await import(pathToFileURL(basePath).href)).createEngine();

const MAX_PLIES = 300;
const WIN_CP = 900;
const WIN_PLIES = 6;

function whitePov(score) {
  return score.kind === 'mate'
    ? (score.winner === 'w' ? 1 : -1) * 10_000
    : score.cp;
}

/** 1 white wins, 0 draw, -1 black wins. */
function play(white, black, fen) {
  const chess = new Chess(fen);
  const fens = [];
  let streak = 0;
  let streakSign = 0;
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    if (chess.isGameOver()) {
      return chess.isCheckmate() ? (chess.turn() === 'w' ? -1 : 1) : 0;
    }
    const now = chess.fen();
    const halfmove = Number(now.split(' ')[4]);
    const out = (chess.turn() === 'w' ? white : black).search({
      fen: now,
      history: fens.slice(fens.length - halfmove),
      depth: 64,
      nodes,
      maxMs: 120_000,
    });
    const uci = out.line.pv[0];
    if (!uci) return 0;
    const cp = whitePov(out.line.score);
    const sign = Math.abs(cp) >= WIN_CP ? Math.sign(cp) : 0;
    streak =
      sign !== 0 && sign === streakSign ? streak + 1 : sign !== 0 ? 1 : 0;
    streakSign = sign;
    if (streak >= WIN_PLIES) return sign;
    fens.push(now);
    chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
  }
  return 0;
}

for (const fen of openings) {
  const asWhite = play(fresh, base, fen);
  const asBlack = -play(base, fresh, fen);
  parentPort.postMessage([asWhite, asBlack]);
}
