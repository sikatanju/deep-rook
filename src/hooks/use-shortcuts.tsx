import { useEffect, useState, type ReactNode } from 'react';

import { ShortcutHelp } from '@/components/shortcut-help';
import { handleShortcut, type Shortcut } from '@/lib/shortcuts';

/**
 * Runs a page's keyboard shortcuts and adds `?`, which opens an overlay listing
 * them. Returns the overlay's button, for the page to place. The handler and
 * the list read the same `shortcuts`.
 */
export function useShortcuts(shortcuts: readonly Shortcut[]): ReactNode {
  const [open, setOpen] = useState(false);
  const all: Shortcut[] = [
    ...shortcuts,
    { keys: ['?'], label: 'Show this list', run: () => setOpen(true) },
  ];

  // Subscribed on every render, so it always sees the page's current state.
  useEffect(() => {
    if (open) return;
    const onKey = (e: KeyboardEvent) => handleShortcut(all, e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <ShortcutHelp shortcuts={all} open={open} onOpenChange={setOpen} />;
}
