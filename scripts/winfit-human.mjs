// node scripts/winfit-human.mjs --games <dir of Lichess ndjson exports>
// Fetch one file per player with
//   curl -H "Accept: application/x-ndjson" "https://lichess.org/api/games/user/<name>?max=40&rated=true&evals=true&moves=true&perfType=blitz,rapid,classical&finished=true"
// Only games that carry a server analysis are used.
// Replays each game, scores sampled positions with our engine, and compares our
// centipawns with Lichess's own evals (the scale its win% constant was fitted on)
// and with the real results.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Chess } from 'chess.js';
import { build } from 'vite';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const dir = arg('games');
if (!dir) throw new Error('pass --games <dir>');
const LICHESS_K = 0.00368208;

const games = new Map();
for (const f of readdirSync(dir)) {
  for (const line of readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
    if (!line.includes('"analysis":[')) continue;
    const g = JSON.parse(line);
    if (g.variant === 'standard' && g.moves && !games.has(g.id))
      games.set(g.id, g);
  }
}

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const work = mkdtempSync(`${tmpdir()}/deeprook-winfit-`);
await build({
  root,
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { '@': `${root}/src` } },
  ssr: { noExternal: true },
  build: {
    ssr: 'scripts/match-engine.ts',
    outDir: work,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'engine.mjs' } },
  },
});
const engine = (
  await import(pathToFileURL(`${work}/engine.mjs`).href)
).createEngine();

// Every third position from move 4 on, where Lichess gave a centipawn eval.
const rows = [];
for (const [id, g] of games) {
  const result = g.winner === 'white' ? 1 : g.winner === 'black' ? 0 : 0.5;
  const chess = new Chess();
  const moves = g.moves.split(' ');
  for (let ply = 0; ply < moves.length; ply++) {
    chess.move(moves[ply]);
    const lichess = g.analysis[ply];
    if (ply < 7 || ply % 3 !== 1 || lichess?.eval === undefined) continue;
    if (chess.isGameOver()) break;
    const score = engine.search({
      fen: chess.fen(),
      history: [],
      depth: 10,
      nodes: 200_000,
      maxMs: 5_000,
    }).line.score;
    if (score.kind !== 'cp') continue;
    rows.push({ id, ours: score.cp, lichess: lichess.eval, result });
  }
}
rmSync(work, { recursive: true, force: true });

const logistic = (k, cp) => 1 / (1 + Math.exp(-k * cp));
const logLoss = (k, sel, rs) => {
  let s = 0;
  for (const r of rs) {
    const p = Math.min(Math.max(logistic(k, sel(r)), 1e-6), 1 - 1e-6);
    s -= r.result * Math.log(p) + (1 - r.result) * Math.log(1 - p);
  }
  return s / rs.length;
};
function fitK(sel, rs) {
  let [lo, hi] = [1e-4, 0.03];
  for (let i = 0; i < 60; i++) {
    const a = lo + (hi - lo) * 0.382;
    const b = lo + (hi - lo) * 0.618;
    if (logLoss(a, sel, rs) < logLoss(b, sel, rs)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
}
const quantile = (v, p) =>
  [...v].sort((a, b) => a - b)[Math.floor(v.length * p)];
const ids = [...new Set(rows.map((r) => r.id))];

console.log(`games ${ids.length}, positions ${rows.length}`);
const mid = rows.filter(
  (r) => Math.abs(r.lichess) >= 30 && Math.abs(r.lichess) <= 600,
);
const ratio = mid.map((r) => r.ours / r.lichess);
console.log(
  `our cp / Lichess cp over |Lichess cp| 30..600 (n=${mid.length}): median ${quantile(ratio, 0.5).toFixed(2)}, quartiles ${quantile(ratio, 0.25).toFixed(2)}..${quantile(ratio, 0.75).toFixed(2)}, slope ${(mid.reduce((s, r) => s + r.lichess * r.ours, 0) / mid.reduce((s, r) => s + r.lichess ** 2, 0)).toFixed(2)}`,
);

const fit = (rs) => ({
  lichess: fitK((r) => r.lichess, rs),
  ours: fitK((r) => r.ours, rs),
});
const k = fit(rows);
// Resample whole games: positions from one game share a result.
let seed = 7;
const rand = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const byId = new Map(ids.map((id) => [id, rows.filter((r) => r.id === id)]));
const boots = Array.from({ length: 100 }, () =>
  fit(ids.flatMap(() => byId.get(ids[Math.floor(rand() * ids.length)]))),
);
const ci = (key) => {
  const v = boots.map((b) => b[key]);
  return `${quantile(v, 0.05).toFixed(5)}..${quantile(v, 0.95).toFixed(5)}`;
};
console.log(
  `fitted k, Lichess cp -> result: ${k.lichess.toFixed(5)}  (90% ${ci('lichess')})`,
);
console.log(
  `fitted k, our cp -> result:     ${k.ours.toFixed(5)}  (90% ${ci('ours')})`,
);
console.log(`Lichess's constant:             ${LICHESS_K}`);
console.log(
  `log loss on results, our cp:  Lichess k ${logLoss(LICHESS_K, (r) => r.ours, rows).toFixed(4)}, fitted k ${logLoss(k.ours, (r) => r.ours, rows).toFixed(4)}, coin flip ${Math.LN2.toFixed(4)}`,
);
console.log(
  `log loss on results, Lichess cp: Lichess k ${logLoss(LICHESS_K, (r) => r.lichess, rows).toFixed(4)}, fitted k ${logLoss(k.lichess, (r) => r.lichess, rows).toFixed(4)}`,
);

console.log(
  '\ncp bucket       n  result  | by our cp: Lichess curve  fitted | by Lichess cp: result',
);
for (let lo = -500; lo < 500; lo += 100) {
  const inB = (key) => rows.filter((r) => r[key] >= lo && r[key] < lo + 100);
  const o = inB('ours');
  const l = inB('lichess');
  if (o.length < 20) continue;
  const mean = (rs, key) => rs.reduce((s, r) => s + r[key], 0) / rs.length;
  const m = mean(o, 'ours');
  console.log(
    `${String(lo).padStart(5)}..${String(lo + 100).padEnd(5)}${String(o.length).padStart(5)}  ${mean(o, 'result').toFixed(3)}   |   ${logistic(LICHESS_K, m).toFixed(3)}        ${logistic(k.ours, m).toFixed(3)}   |   ${l.length >= 20 ? mean(l, 'result').toFixed(3) : '-'} (n=${l.length})`,
  );
}
