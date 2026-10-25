/**
 * What a search of position `index` needs: its FEN plus the FENs before it back
 * to the last irreversible move (the FEN's halfmove clock), oldest first, for
 * repetition detection. `fens` is the path from the start to `index` or beyond.
 */
export function searchInputAt(
  fens: readonly string[],
  index: number,
): { fen: string; history: string[] } {
  const fen = fens[index]!;
  const halfmove = Number(fen.split(' ')[4]) || 0;
  return { fen, history: fens.slice(Math.max(0, index - halfmove), index) };
}
