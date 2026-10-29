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
 * Click-to-move on `fen`: pick a piece, pick a square. `onMove` hears each
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

  const play: BoardPlay | undefined = enabled
    ? {
        selected,
        targets: selected ? targetsFrom(fen, selected) : [],
        onSquare,
      }
    : undefined;

  return {
    play,
    /** The move waiting on a piece choice, or null. */
    promoting,
    promote: (piece: NonNullable<Move['promotion']>) =>
      promoting && finish({ ...promoting, promotion: piece }),
  };
}
