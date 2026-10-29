// The keyboard shortcuts of a page, defined once. The page's key handler runs
// them and the `?` overlay lists them, so the list cannot drift from what is
// handled.

export type Shortcut = {
  /** `KeyboardEvent.key` values that trigger it. */
  keys: readonly string[];
  /** What it does, for the overlay. */
  label: string;
  /** Return false when the key does not apply right now, to leave it to the browser. */
  run: (e: KeyboardEvent) => boolean | void;
};

/** Whether a key press in `target` is text being typed, not a shortcut. */
export function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/**
 * Runs the shortcut `e` triggers, if any. Keys with ctrl, meta or alt held, and
 * keys typed into a text field, are never shortcuts. Returns whether one ran.
 */
export function handleShortcut(
  shortcuts: readonly Shortcut[],
  e: KeyboardEvent,
) {
  if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return false;
  const found = shortcuts.find((s) => s.keys.includes(e.key));
  if (!found || found.run(e) === false) return false;
  e.preventDefault();
  return true;
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ' ': 'Space',
  Escape: 'Esc',
};

/** How a `KeyboardEvent.key` reads on a keycap. */
export const keyName = (key: string) =>
  KEY_NAMES[key] ??
  (key.length !== 1
    ? key
    : key !== key.toLowerCase()
      ? `Shift ${key}`
      : key.toUpperCase());
