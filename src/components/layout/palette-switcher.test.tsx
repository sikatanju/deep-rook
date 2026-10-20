import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { PALETTES } from '@/lib/palettes';

import { PaletteSwitcher } from './palette-switcher';

test('one pressed disc per palette, Arcade Night last', async () => {
  const onChange = vi.fn();
  render(<PaletteSwitcher value="mint" onChange={onChange} />);
  const discs = screen.getAllByRole('button');
  expect(discs.map((d) => d.getAttribute('aria-label'))).toEqual(
    PALETTES.map((p) => p.name),
  );
  expect(discs.at(-1)).toHaveAccessibleName('Arcade Night');
  expect(screen.getByRole('button', { name: 'Mint Gambit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Pop Quiz' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await userEvent.click(screen.getByRole('button', { name: 'Blueprint' }));
  expect(onChange).toHaveBeenCalledWith('blueprint');
});
