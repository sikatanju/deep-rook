import { describe, expect, test } from 'vitest';

import { stageAt } from './stage';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Seven pieces besides pawns and kings: three Black, four White.
const SEVEN = 'rnb1k3/pppp4/8/8/8/8/PPPP4/RN2K1BR w - - 0 1';
// The same with Black's bishop gone: six, so an endgame.
const SIX = 'rn2k3/pppp4/8/8/8/8/PPPP4/RN2K1BR w - - 0 1';

describe('stageAt', () => {
  test('the opening runs for the first twenty plies', () => {
    expect(stageAt(START, 0)).toBe('opening');
    expect(stageAt(START, 19)).toBe('opening');
  });

  test('the middlegame starts at ply twenty', () => {
    expect(stageAt(START, 20)).toBe('middlegame');
    expect(stageAt(SEVEN, 60)).toBe('middlegame');
  });

  test('six pieces or fewer is an endgame, pawns and kings not counted', () => {
    expect(stageAt(SIX, 60)).toBe('endgame');
    expect(stageAt('8/8/4k3/8/8/4K3/4R3/8 w - - 0 1', 90)).toBe('endgame');
    expect(stageAt('8/pppppppp/4k3/8/8/4K3/PPPPPPPP/8 w - - 0 1', 90)).toBe(
      'endgame',
    );
  });

  test('an early queen trade ends the middlegame before it starts', () => {
    expect(stageAt(SIX, 4)).toBe('endgame');
  });
});
