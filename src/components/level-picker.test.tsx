import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { ANALYSIS_LEVELS, LEVELS } from '@/lib/analysis/levels';

import { LevelPicker } from './level-picker';

test('a radiogroup of every level with the chosen one checked', async () => {
  const onChange = vi.fn();
  render(<LevelPicker name="mode" value="balanced" onChange={onChange} />);
  expect(screen.getByRole('group', { name: 'Review mode' })).toBeVisible();
  expect(screen.getAllByRole('radio')).toHaveLength(LEVELS.length);
  expect(screen.getByRole('radio', { name: /Balanced/ })).toBeChecked();

  await userEvent.click(screen.getByRole('radio', { name: /Deep/ }));
  expect(onChange).toHaveBeenCalledWith('deep');
});

test('the full picker names each level with its promise, the compact one only the name', () => {
  const { rerender } = render(
    <LevelPicker name="mode" value="fast" onChange={() => {}} />,
  );
  expect(screen.getByText(ANALYSIS_LEVELS.deep.blurb)).toBeInTheDocument();

  rerender(
    <LevelPicker compact name="mode" value="fast" onChange={() => {}} />,
  );
  expect(screen.queryByText(ANALYSIS_LEVELS.deep.blurb)).toBeNull();
  expect(screen.getByRole('radio', { name: 'Deep' })).toBeInTheDocument();
});

test('arrow keys move between the levels', async () => {
  const onChange = vi.fn();
  render(<LevelPicker name="mode" value="fast" onChange={onChange} />);
  screen.getByRole('radio', { name: /Fast/ }).focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(onChange).toHaveBeenCalledWith('balanced');
});
