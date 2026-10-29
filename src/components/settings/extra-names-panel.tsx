import { useState } from 'react';

import { useStore } from '@/app/store';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addExtraName, MAX_EXTRA_NAMES } from '@/lib/extra-names';

/** Names the player goes by besides their saved usernames, so those games count as theirs. */
export function ExtraNamesPanel() {
  const { settings, setSettings } = useStore();
  const { extraNames } = settings;
  const [value, setValue] = useState('');
  const full = extraNames.length >= MAX_EXTRA_NAMES;

  function add(e: { preventDefault: () => void }) {
    e.preventDefault();
    setSettings({ extraNames: addExtraName(extraNames, value) });
    setValue('');
  }

  return (
    <Panel
      tag="You"
      title="Extra names"
      subtitle="Games under your Chess.com or Lichess username are yours already. Add the names you play under elsewhere, such as over the board, an alt account or another site, so those games count as yours too. Case and spaces around a name do not matter."
    >
      <form onSubmit={add} className="flex max-w-[420px] gap-3">
        <Input
          aria-label="Extra name"
          value={value}
          disabled={full}
          maxLength={60}
          autoComplete="off"
          placeholder="A name as it appears in the game"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={full || !value.trim()}>
          Add name
        </Button>
      </form>
      {full && (
        <p className="text-ink-muted text-sm">
          That is the most names you can keep. Remove one to add another.
        </p>
      )}
      {extraNames.length > 0 && (
        <ul aria-label="Extra names" className="flex flex-wrap gap-3">
          {extraNames.map((name) => (
            <li
              key={name}
              className="border-line bg-surface-alt flex items-center gap-2 rounded-sm border-2 py-1 pr-1 pl-2.5 font-bold"
            >
              {name}
              <Button
                size="xs"
                variant="ghost"
                aria-label={`Remove ${name}`}
                onClick={() =>
                  setSettings({
                    extraNames: extraNames.filter((n) => n !== name),
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
