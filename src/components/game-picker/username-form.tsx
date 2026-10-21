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

export function UsernameForm({
  busy,
  onSearch,
}: {
  busy: boolean;
  onSearch: (username: string) => void;
}) {
  const [value, setValue] = useState(() => readSavedUsername('chesscom'));

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const username = value.trim();
    if (!username) return;
    try {
      localStorage.setItem(STORAGE_KEYS.chesscom, username);
    } catch {
      // storage unavailable, the username just is not remembered
    }
    onSearch(username);
  }

  return (
    <form onSubmit={submit} className="flex gap-3">
      <Input
        aria-label="Chess.com username"
        placeholder="Chess.com username"
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
