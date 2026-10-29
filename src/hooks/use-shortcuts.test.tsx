import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { useShortcuts } from './use-shortcuts';

function Page({ run }: { run: () => void }) {
  const help = useShortcuts([{ keys: ['a', 'b'], label: 'Do the thing', run }]);
  return <div>{help}</div>;
}

test('the keys the overlay lists are the keys the handler runs', async () => {
  const run = vi.fn();
  const user = userEvent.setup();
  render(<Page run={run} />);
  await user.keyboard('?');
  const keys = within(screen.getByRole('dialog'))
    .getAllByRole('listitem')[0]!
    .querySelectorAll('kbd');
  expect([...keys].map((k) => k.textContent)).toEqual(['A', 'B']);
  await user.keyboard('{Escape}');

  await user.keyboard('a');
  await user.keyboard('b');
  expect(run).toHaveBeenCalledTimes(2);
  await user.keyboard('c');
  expect(run).toHaveBeenCalledTimes(2);
});
