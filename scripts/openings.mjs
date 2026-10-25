// pnpm openings
// Rebuilds src/lib/chess/openings.json from the Lichess opening names (CC0,
// github.com/lichess-org/chess-openings) at the pinned commit. Each entry is a
// position, so a game names its opening however it got there. Bump COMMIT and
// rerun to pick up new names.
import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { Chess } from 'chess.js';

const COMMIT = 'a6189a30dc273ccb21fc2536a9a2fefd5592a67a';
const FILES = ['a', 'b', 'c', 'd', 'e'];
const OUT = new URL('../src/lib/chess/openings.json', import.meta.url);

/** Placement, side, castling and en passant: what makes two positions the same opening. */
const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

const rows = [];
for (const file of FILES) {
  const url = `https://raw.githubusercontent.com/lichess-org/chess-openings/${COMMIT}/${file}.tsv`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`${url}: ${response.status}`);
    process.exit(1);
  }
  const [header, ...lines] = (await response.text()).trim().split('\n');
  if (header !== 'eco\tname\tpgn') {
    console.error(`${url}: unexpected columns "${header}"`);
    process.exit(1);
  }
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    rows.push({
      key: positionKey(chess.fen()),
      eco,
      name,
      plies: chess.history().length,
    });
  }
}

const byKey = new Map();
for (const row of rows) {
  const have = byKey.get(row.key);
  if (have) {
    console.error(`one position, two names: "${have.name}" and "${row.name}"`);
    process.exit(1);
  }
  byKey.set(row.key, row);
}

const positions = Object.fromEntries(
  [...byKey.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => [row.key, `${row.eco} ${row.name}`]),
);
const maxPlies = Math.max(...rows.map((row) => row.plies));
writeFileSync(
  OUT,
  JSON.stringify({ commit: COMMIT, maxPlies, positions }) + '\n',
);
console.log(
  `${rows.length} lines, ${byKey.size} positions, deepest ${maxPlies} plies -> ${OUT.pathname}`,
);
