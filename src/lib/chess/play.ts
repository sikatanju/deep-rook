// Making a move on a position: the drill's input rules, over chess.js. Every
// function takes a FEN and never throws, so the UI can ask freely.

import { Chess, type Square } from 'chess.js';

export type { Square };

export type Move = {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
};

export const uciOf = (m: Move): string => m.from + m.to + (m.promotion ?? '');

function legalFrom(fen: string, from: string) {
  try {
    return new Chess(fen).moves({ square: from as Square, verbose: true });
  } catch {
    return [];
  }
}

/** A piece of the side to move stands on `square`. */
export function ownsSquare(fen: string, square: string): boolean {
  try {
    const chess = new Chess(fen);
    return chess.get(square as Square)?.color === chess.turn();
  } catch {
    return false;
  }
}

/** Legal destinations of the piece on `from`, each once (promotions share one). */
export function targetsFrom(fen: string, from: string): Square[] {
  return [...new Set(legalFrom(fen, from).map((m) => m.to))];
}

export function needsPromotion(fen: string, from: string, to: string): boolean {
  return legalFrom(fen, from).some((m) => m.to === to && m.promotion);
}

const PIECE_LETTER = /^[nbrqk]/;

function tryMove(fen: string, text: string): Move | null {
  try {
    const m = new Chess(fen).move(text);
    return {
      from: m.from,
      to: m.to,
      promotion: m.promotion as Move['promotion'],
    };
  } catch {
    return null;
  }
}

/**
 * Typed input to a move: SAN with or without check marks or annotations,
 * zeros for castling, and a lowercase piece letter when the text reads as no
 * pawn move. null when the text is no legal move or names more than one.
 */
export function moveFromSan(fen: string, san: string): Move | null {
  const text = san
    .trim()
    .replace(/[+#!?]+$/, '')
    .replace(/^0-0(-0)?$/, (castle) => castle.replace(/0/g, 'O'));
  if (!text) return null;
  const exact = tryMove(fen, text);
  if (exact || !PIECE_LETTER.test(text)) return exact;
  return tryMove(fen, text[0]!.toUpperCase() + text.slice(1));
}
