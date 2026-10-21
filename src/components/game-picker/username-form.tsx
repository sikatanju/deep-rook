import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STORAGE_KEY = 'lastUsername';

/** The Chess.com username last searched for, or '' when none is saved. */
export function readSavedUsername(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function UsernameForm({
  busy,
  onSearch,
}: {
  busy: boolean;
  onSearch: (username: string) => void;
}) {
  const [value, setValue] = useState(readSavedUsername);

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const username = value.trim();
    if (!username) return;
    try {
      localStorage.setItem(STORAGE_KEY, username);
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
