import { useState } from 'react';

import type { BoardPlay } from '@/components/board/board';
import {
  needsPromotion,
  ownsSquare,
  targetsFrom,
  type Move,
  type Square,
} from '@/lib/chess/play';

type Pending = { fen: string; selected: Square | null; promoting: Move | null };

/**
 * Click-to-move or drag-and-drop on `fen`: pick a piece, pick a square, or
 * drag the piece onto it. `onMove` hears each
 * finished move, with the piece chosen for a promotion. A selection belongs
 * to the position it was made in, so a new `fen` starts clean. `play` is
 * undefined when `enabled` is false, which leaves the board a picture.
 */
export function useMoveInput(
  fen: string,
  onMove: (move: Move) => void,
  enabled = true,
) {
  const [state, setState] = useState<Pending>({
    fen,
    selected: null,
    promoting: null,
  });
  const { selected, promoting } =
    state.fen === fen ? state : { selected: null, promoting: null };

  const set = (patch: Partial<Omit<Pending, 'fen'>>) =>
    setState({ fen, selected, promoting, ...patch });

  function finish(move: Move) {
    set({ selected: null, promoting: null });
    onMove(move);
  }

  function onSquare(square: string) {
    const at = square as Square;
    if (ownsSquare(fen, at)) {
      set({ selected: at === selected ? null : at, promoting: null });
      return;
    }
    if (!selected || !targetsFrom(fen, selected).includes(at)) {
      set({ selected: null });
      return;
    }
    if (needsPromotion(fen, selected, at))
      set({ promoting: { from: selected, to: at } });
    else finish({ from: selected, to: at });
  }

  /** Picking a piece up selects it, so its targets light while it travels. */
  function onDragStart(square: string) {
    const at = square as Square;
    if (!ownsSquare(fen, at)) return false;
    set({ selected: at, promoting: null });
    return true;
  }

  /** A drop on a target plays, as a click on it would; any other drop only
   * sends the piece home, leaving it selected for a click to finish. */
  function onDrop(from: string, to: string | null) {
    const a = from as Square;
    const b = to as Square | null;
    if (!b || !targetsFrom(fen, a).includes(b)) return;
    if (needsPromotion(fen, a, b))
      set({ selected: a, promoting: { from: a, to: b } });
    else finish({ from: a, to: b });
  }

  const play: BoardPlay | undefined = enabled
    ? {
        selected,
        targets: selected ? targetsFrom(fen, selected) : [],
        onSquare,
        onDragStart,
        onDrop,
      }
    : undefined;

  return {
    play,
    /** The move waiting on a piece choice, or null. */
    promoting,
    promote: (piece: NonNullable<Move['promotion']>) =>
      promoting && finish({ ...promoting, promotion: piece }),
    /** Plays a move typed in rather than clicked. */
    submit: finish,
  };
}
