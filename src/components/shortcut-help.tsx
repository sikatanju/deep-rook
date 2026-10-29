import { KeyboardIcon, XIcon } from 'lucide-react';
import { Dialog } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { keyName, type Shortcut } from '@/lib/shortcuts';

/** The `?` overlay: a button that opens a dialog listing a page's shortcuts. */
export function ShortcutHelp({
  shortcuts,
  open,
  onOpenChange,
}: {
  shortcuts: readonly Shortcut[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button
          size="icon-sm"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <KeyboardIcon aria-hidden />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ground/80 fixed inset-0 z-50" />
        <Dialog.Content
          // Keys typed in here are the dialog's, not the page's shortcuts.
          onKeyDown={(e) => e.stopPropagation()}
          className="border-line bg-surface text-ink fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border-3 p-5 shadow-lg"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-2xl font-extrabold">
              Keyboard shortcuts
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon-sm" aria-label="Close">
                <XIcon aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-ink-muted mt-1 text-sm">
            What the keys do on this page.
          </Dialog.Description>
          <ul className="mt-4 flex flex-col gap-2">
            {shortcuts.map((s) => (
              <li
                key={s.label}
                className="flex items-center justify-between gap-4"
              >
                <span>{s.label}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="border-line bg-surface-alt rounded-sm border-2 px-1.5 font-mono text-xs leading-5 font-bold"
                    >
                      {keyName(k)}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
