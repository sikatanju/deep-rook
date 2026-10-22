import { DownloadIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { annotatedPgn, pgnFilename } from '@/lib/analysis/export-pgn';
import type { GameAnalysis } from '@/lib/analysis/game-analysis';
import type { Replay } from '@/lib/chess/replay';

/** Saves the reviewed game as a PGN with evals and grades, once every position has settled. */
export function ExportPgn({
  replay,
  analysis,
}: {
  replay: Replay;
  analysis: GameAnalysis | null;
}) {
  const ready =
    analysis !== null && analysis.done === analysis.positions.length;

  function onDownload() {
    if (!analysis) return;
    const url = URL.createObjectURL(
      new Blob([annotatedPgn(replay, analysis)], {
        type: 'application/x-chess-pgn',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = pgnFilename(replay.headers);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Button
      size="icon-sm"
      aria-label="Download annotated PGN"
      title={
        ready
          ? 'Download annotated PGN'
          : 'Download annotated PGN (once the review finishes)'
      }
      disabled={!ready}
      onClick={onDownload}
    >
      <DownloadIcon aria-hidden />
    </Button>
  );
}
