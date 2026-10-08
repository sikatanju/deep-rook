import { useState } from 'react';

import { useStore } from '@/app/store';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { OPERA_GAME } from '@/lib/chess/replay';

export function PgnImport() {
  const { openPgn } = useStore();
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load(text: string, source: string) {
    try {
      openPgn(text, source);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that PGN.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste a PGN</CardTitle>
        <CardDescription>
          Works offline. Any game from any site.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <textarea
          aria-label="PGN"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...'}
          className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-3 font-mono text-sm outline-none focus-visible:ring-2"
        />
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            onClick={() => load(pgn, 'Pasted game')}
            disabled={!pgn.trim()}
          >
            Load PGN
          </Button>
          <Button
            variant="outline"
            onClick={() => load(OPERA_GAME, 'The Opera Game')}
          >
            Try the Opera Game
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
