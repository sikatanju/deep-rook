// pnpm match [--base <git ref>] [--nodes N] [--openings N]
// Plays the working tree's engine against the engine at a git ref (default
// HEAD, or a directory holding a src/ tree), a fixed node count per move, both colours of every opening. Prints
// W/D/L and an Elo difference with a 95% interval. A change earns its place
// when the interval clears zero; "bench" says what it costs in nodes/s.
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import process from 'node:process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import { Chess } from 'chess.js';
import { build } from 'vite';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const ref = arg('base', 'HEAD');
const nodes = Number(arg('nodes', 20_000));
const wanted = Number(arg('openings', 100));

const root = fileURLToPath(new URL('..', import.meta.url));
const work = mkdtempSync(`${tmpdir()}/deeprook-match-`);

async function bundle(srcRoot, name) {
  await build({
    root: srcRoot,
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: { '@': `${srcRoot}/src` } },
    ssr: { noExternal: true },
    build: {
      ssr: 'scripts/match-engine.ts',
      outDir: `${work}/${name}`,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'engine.mjs' } },
    },
  });
  return `${work}/${name}/engine.mjs`;
}

const baseTree = `${work}/base-src`;
mkdirSync(baseTree);
// A directory with a src/ tree works as a baseline too, to compare one step against the last.
execFileSync(
  'sh',
  [
    '-c',
    existsSync(`${ref}/src`)
      ? `cp -r ${ref}/src ${baseTree}/src`
      : `git archive ${ref} src | tar -x -C ${baseTree}`,
  ],
  { cwd: root },
);
mkdirSync(`${baseTree}/scripts`);
writeFileSync(
  `${baseTree}/scripts/match-engine.ts`,
  "export { createEngine } from '@/lib/engine/engine';\n",
);
symlinkSync(`${root}node_modules`, `${baseTree}/node_modules`);

const newPath = await bundle(root.replace(/\/$/, ''), 'new');
const basePath = await bundle(baseTree, 'base');

// Seeded random 8-ply openings kept when a shallow search calls them level.
let seed = 20240607;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const judge = (await import(pathToFileURL(basePath).href)).createEngine();
const openings = new Set();
while (openings.size < wanted) {
  const chess = new Chess();
  for (let i = 0; i < 8 && !chess.isGameOver(); i++) {
    const moves = chess.moves();
    chess.move(moves[Math.floor(rand() * moves.length)]);
  }
  if (chess.isGameOver()) continue;
  const out = judge.search({
    fen: chess.fen(),
    history: [],
    depth: 6,
    nodes: 200_000,
    maxMs: 5_000,
  });
  const { score } = out.line;
  if (score.kind === 'cp' && Math.abs(score.cp) <= 100)
    openings.add(chess.fen());
}

const list = [...openings];
const n = Math.min(cpus().length, list.length);
const t0 = performance.now();
let w = 0;
let d = 0;
let l = 0;
let done = 0;
const results = [];
await Promise.all(
  Array.from({ length: n }, (_, k) => {
    const worker = new Worker(new URL('./match-worker.mjs', import.meta.url), {
      workerData: {
        newPath,
        basePath,
        nodes,
        openings: list.filter((_, i) => i % n === k),
      },
    });
    return new Promise((resolve, reject) => {
      worker.on('message', (pair) => {
        for (const r of pair) {
          results.push(r);
          if (r > 0) w++;
          else if (r < 0) l++;
          else d++;
        }
        done++;
        process.stderr.write(
          `\r${done}/${list.length} openings  +${w} =${d} -${l}`,
        );
      });
      worker.on('error', reject);
      worker.on('exit', resolve);
    });
  }),
);
process.stderr.write('\n');

const games = w + d + l;
const mean = (w + d / 2) / games;
const variance =
  results.reduce((s, r) => s + ((r + 1) / 2 - mean) ** 2, 0) / games;
const margin = 1.96 * Math.sqrt(variance / games);
const elo = (p) =>
  -400 * Math.log10(1 / Math.min(Math.max(p, 1e-4), 1 - 1e-4) - 1);
console.log(
  `new vs ${ref} @ ${nodes} nodes/move: +${w} =${d} -${l} (${games} games, ${Math.round((performance.now() - t0) / 1000)}s)\n` +
    `Elo ${elo(mean).toFixed(0)} [${elo(mean - margin).toFixed(0)}, ${elo(mean + margin).toFixed(0)}]`,
);
rmSync(work, { recursive: true, force: true });
