import { DownloadIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useOpeningBook } from '@/hooks/use-opening-book';
import { annotatedPgn, pgnFilename } from '@/lib/analysis/export-pgn';
import type { GameAnalysis } from '@/lib/analysis/game-analysis';
import type { Replay } from '@/lib/chess/replay';

/**
 * Saves the reviewed game as a PGN with evals and grades, once every position
 * has a line. A failed position has settled and still has no eval, so `done`
 * reaching the position count is not enough.
 */
export function ExportPgn({
  replay,
  analysis,
}: {
  replay: Replay;
  analysis: GameAnalysis | null;
}) {
  const book = useOpeningBook();
  const ready =
    analysis !== null &&
    analysis.positions.every((position) => position.status === 'done');

  function onDownload() {
    if (!analysis) return;
    const url = URL.createObjectURL(
      new Blob([annotatedPgn(replay, analysis, book ?? null)], {
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
          : analysis?.positions.some((position) => position.status === 'failed')
            ? 'Download annotated PGN (a position has no eval)'
            : 'Download annotated PGN (once the review finishes)'
      }
      disabled={!ready}
      onClick={onDownload}
    >
      <DownloadIcon aria-hidden />
    </Button>
  );
}
