import { useState } from 'react';

import { useStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/panel';
import { OPERA_GAME } from '@/lib/chess/replay';

export function PgnImport() {
  const { stagePgn } = useStore();
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | null>(null);

  function stage(text: string, source: string) {
    try {
      stagePgn(text, source);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that PGN.');
    }
  }

  return (
    <Panel
      tag="Offline"
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
        className="border-line bg-surface-alt text-ink placeholder:text-ink-muted min-h-[104px] w-full resize-y rounded-sm border-3 p-3 font-mono text-[13px] shadow-[inset_3px_3px_0_0_rgb(0_0_0/0.08)]"
      />
      {error && (
        <p role="alert" className="text-ink font-bold">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => stage(pgn, 'Pasted game')}
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
