import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { Site } from '@/lib/chesscom/types';

const STORAGE_KEYS: Record<Site, string> = {
  chesscom: 'lastUsername',
  lichess: 'lastLichessUsername',
};

/** The username last searched for on `site`, or '' when none is saved. */
export function readSavedUsername(site: Site): string {
  try {
    return localStorage.getItem(STORAGE_KEYS[site]) ?? '';
  } catch {
    return '';
  }
}

/** Every site's saved username, without the empty ones. */
export function readSavedUsernames(): string[] {
  return (Object.keys(STORAGE_KEYS) as Site[])
    .map(readSavedUsername)
    .filter(Boolean);
}

export const SITE_NAMES: Record<Site, string> = {
  chesscom: 'Chess.com',
  lichess: 'Lichess',
};

/** Starts from `site`'s saved username; key it by site to switch. */
export function UsernameForm({
  site,
  busy,
  onSearch,
}: {
  site: Site;
  busy: boolean;
  onSearch: (username: string) => void;
}) {
  const [value, setValue] = useState(() => readSavedUsername(site));
  const label = `${SITE_NAMES[site]} username`;

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const username = value.trim();
    if (!username) return;
    try {
      localStorage.setItem(STORAGE_KEYS[site], username);
    } catch {
      // storage unavailable, the username just is not remembered
    }
    onSearch(username);
  }

  return (
    <form onSubmit={submit} className="flex gap-3">
      <Input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      <Button type="submit" variant="primary" disabled={busy || !value.trim()}>
        {busy ? 'Loading…' : 'Find games'}
      </Button>
    </form>
  );
}
