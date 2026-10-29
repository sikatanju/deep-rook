import { useMemo, useState } from 'react';

import { useStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/panel';
import { useMyNames } from '@/hooks/use-my-names';
import { sideOf } from '@/lib/analysis/overview';
import { OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import { cn } from '@/lib/utils';

type Choice = 'w' | 'b' | 'none';

const CHOICES: { id: Choice; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'b', label: 'Black' },
  { id: 'none', label: 'Not me' },
];

export function PgnImport() {
  const { stagePgn } = useStore();
  const names = useMyNames();
  const [pgn, setPgn] = useState('');
  // Null until the player picks; until then the side a saved name matches.
  const [picked, setPicked] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guess = useMemo(() => {
    try {
      const { headers, mine } = parseReplay(pgn);
      return sideOf(headers, names, mine);
    } catch {
      return null;
    }
  }, [pgn, names]);
  const choice: Choice = picked ?? guess ?? 'none';

  function stage(text: string, source: string, side?: Choice) {
    try {
      // The side the player sees selected is saved with the game, the default
      // included; the Opera Game states none and keeps matching by name.
      stagePgn(
        text,
        source,
        side === undefined
          ? { orientation: guess ?? 'w' }
          : {
              mine: side === 'none' ? null : side,
              orientation: side === 'b' ? 'b' : 'w',
            },
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that PGN.');
    }
  }

  return (
    <Panel
      title="Paste a PGN"
      subtitle="Works offline. Any game from any site."
    >
      <textarea
        aria-label="PGN"
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...'}
        className="border-line bg-surface-alt text-ink placeholder:text-ink-muted min-h-[104px] w-full resize-y rounded-sm border-2 p-3 font-mono text-[13px] shadow-[inset_3px_3px_0_0_rgb(0_0_0/0.08)]"
      />
      <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-3 border-0 p-0">
        <legend className="text-ink mb-2 font-bold">
          Which side were you?
        </legend>
        {CHOICES.map(({ id, label }) => (
          <label
            key={id}
            className={cn(
              'border-line bg-surface text-ink has-[:focus-visible]:outline-focus cursor-pointer rounded-sm border-3 px-3 py-1 font-bold shadow-sm has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2',
              choice === id &&
                'bg-primary text-sticker-ink -translate-x-0.5 -translate-y-0.5 shadow-md',
            )}
          >
            <input
              type="radio"
              name="pgn-side"
              className="sr-only"
              checked={choice === id}
              onChange={() => setPicked(id)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-ink font-bold">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => stage(pgn, 'Pasted game', choice)}
          disabled={!pgn.trim()}
        >
          Load PGN
        </Button>
        <Button
          variant="ghost"
          onClick={() => stage(OPERA_GAME, 'The Opera Game')}
        >
          Try the Opera Game
        </Button>
      </div>
    </Panel>
  );
}
