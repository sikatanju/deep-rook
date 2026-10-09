// Bundled and run by scripts/bench.mjs.
import { ANALYSIS_LEVELS } from '@/lib/analysis/levels';
import { OPERA_GAME, fenAt, parseReplay } from '@/lib/chess/replay';
import { createEngine } from '@/lib/engine/engine';

const opera = parseReplay(OPERA_GAME);
const FENS = [
  fenAt(opera, 0),
  fenAt(opera, 10),
  fenAt(opera, 20),
  fenAt(opera, 26),
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  '6k1/pp3ppp/2p5/8/3P4/2P5/PP3PPP/6K1 w - - 0 1',
];

const engine = createEngine();
for (const [name, level] of Object.entries(ANALYSIS_LEVELS)) {
  let nodes = 0;
  let ms = 0;
  const rows = FENS.map((fen) => {
    const out = engine.search({ fen, history: [], ...level.limits });
    nodes += out.nodes;
    ms += out.ms;
    return `d${out.line.depth} ${out.reason} ${Math.round(out.ms)}ms`;
  });
  console.log(
    `${name}: ${nodes} nodes, ${Math.round(ms)}ms, ${Math.round(nodes / (ms / 1000))} nps\n  ${rows.join('\n  ')}`,
  );
}
