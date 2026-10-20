import type { GameAnalysis } from '@/lib/analysis/game-analysis';
import { ANALYSIS_LEVELS } from '@/lib/analysis/levels';
import { sanLine } from '@/lib/chess/replay';
import { formatScore } from '@/lib/chess/score';

/**
 * Eval and best line for one position (whole-game progress is the
 * AnalysisMeter's).
 * Keeps its layout while `analysis` is null so the card does not jump.
 */
export function EnginePanel({
  analysis,
  index,
  fen,
}: {
  analysis: GameAnalysis | null;
  index: number;
  fen: string;
}) {
  const here = analysis?.positions[index];
  const line = here && here.status !== 'failed' ? here.line : null;
  const moves = line ? sanLine(fen, line.pv.slice(0, 8)) : [];
  const status = !analysis
    ? 'Starting engine'
    : analysis.unavailable
      ? 'Engine unavailable in this browser'
      : here?.status === 'failed'
        ? 'No evaluation'
        : `${ANALYSIS_LEVELS[analysis.level].label}${line ? ` · depth ${line.depth}` : ''}${here?.status === 'done' ? '' : ' · thinking'}`;

  return (
    <section aria-label="Engine" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <output
          aria-label="Evaluation"
          className="border-line bg-surface-alt rounded-sm border-3 px-2 py-0.5 font-mono text-2xl font-bold tabular-nums shadow-sm"
        >
          {line ? formatScore(line.score) : analysis?.unavailable ? '–' : '…'}
        </output>
        <span className="text-ink-muted text-right text-xs font-bold">
          {status}
        </span>
      </div>
      {moves.length > 0 && (
        <p>
          <span className="text-ink-muted">Best: </span>
          <span className="font-mono font-bold">{moves.join(' ')}</span>
        </p>
      )}
    </section>
  );
}
