// Extra names a player is known by (over-the-board, alt accounts, other
// sites), kept in settings. Matching against a game's players is `sideOf`'s job.

export const MAX_EXTRA_NAMES = 20;
export const MAX_NAME_LENGTH = 60;

/** `names` plus `name`, trimmed; unchanged when blank, already there (in any case) or the list is full. */
export function addExtraName(names: readonly string[], name: string): string[] {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  const lower = trimmed.toLowerCase();
  if (
    !trimmed ||
    names.length >= MAX_EXTRA_NAMES ||
    names.some((n) => n.toLowerCase() === lower)
  )
    return [...names];
  return [...names, trimmed];
}

/** `names` with each of `more` added, as by `addExtraName`. */
export function mergeExtraNames(
  names: readonly string[],
  more: readonly string[],
): string[] {
  return more.reduce((all, name) => addExtraName(all, name), [...names]);
}

/** A saved list, or [] for anything that is not one; bad entries are dropped. */
export function parseExtraNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return mergeExtraNames(
    [],
    value.filter((v): v is string => typeof v === 'string'),
  );
}
