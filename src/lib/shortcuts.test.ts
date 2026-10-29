import { expect, test, vi } from 'vitest';

import { handleShortcut, keyName, type Shortcut } from './shortcuts';

function press(target: EventTarget, init: KeyboardEventInit) {
  const e = new KeyboardEvent('keydown', { cancelable: true, ...init });
  Object.defineProperty(e, 'target', { value: target });
  return e;
}

test('runs the shortcut whose key was pressed and takes the key from the browser', () => {
  const run = vi.fn();
  const list: Shortcut[] = [{ keys: ['a', 'b'], label: 'A', run }];
  const e = press(document.body, { key: 'b' });
  expect(handleShortcut(list, e)).toBe(true);
  expect(run).toHaveBeenCalledOnce();
  expect(e.defaultPrevented).toBe(true);
  expect(handleShortcut(list, press(document.body, { key: 'c' }))).toBe(false);
});

test('a shortcut that returns false leaves the key to the browser', () => {
  const list: Shortcut[] = [{ keys: ['a'], label: 'A', run: () => false }];
  const e = press(document.body, { key: 'a' });
  expect(handleShortcut(list, e)).toBe(false);
  expect(e.defaultPrevented).toBe(false);
});

test('keys typed into a field, or with a modifier held, are not shortcuts', () => {
  const run = vi.fn();
  const list: Shortcut[] = [{ keys: ['a'], label: 'A', run }];
  expect(
    handleShortcut(list, press(document.createElement('input'), { key: 'a' })),
  ).toBe(false);
  expect(
    handleShortcut(list, press(document.body, { key: 'a', ctrlKey: true })),
  ).toBe(false);
  expect(run).not.toHaveBeenCalled();
});

test('names keys as they read on a keycap', () => {
  expect(['ArrowLeft', ' ', 'Escape', 'f', 'N', 'Enter', '?'].map(keyName)).toEqual([
    '←',
    'Space',
    'Esc',
    'F',
    'Shift N',
    'Enter',
    '?',
  ]);
});
