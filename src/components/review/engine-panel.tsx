import type { GameAnalysis } from '@/lib/analysis/game-analysis';
import { ANALYSIS_LEVELS } from '@/lib/analysis/levels';
import { sanLine } from '@/lib/chess/replay';
import { formatScore, winPercent } from '@/lib/chess/score';

/**
 * Eval, win-chance bar, best line, and whole-game progress for one position.
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
  const white = line ? winPercent(line.score) : 50;
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
      <div className="flex items-baseline justify-between gap-2">
        <output
          aria-label="Evaluation"
          className="font-mono text-2xl font-semibold tabular-nums"
        >
          {line ? formatScore(line.score) : analysis?.unavailable ? '–' : '…'}
        </output>
        <span className="text-xs opacity-70">{status}</span>
      </div>
      <div
        role="meter"
        aria-label="White's winning chances"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(white)}
        className="h-2 overflow-hidden rounded-full bg-neutral-800"
      >
        <div
          className="h-full bg-neutral-100 transition-[width] duration-300"
          style={{ width: `${white}%` }}
        />
      </div>
      {moves.length > 0 && (
        <p className="text-sm">
          <span className="opacity-70">Best: </span>
          <span className="font-medium">{moves.join(' ')}</span>
        </p>
      )}
      {analysis &&
        !analysis.unavailable &&
        analysis.done < analysis.positions.length && (
          <p className="text-xs opacity-60">
            Analyzing game: {analysis.done}/{analysis.positions.length}{' '}
            positions
          </p>
        )}
    </section>
  );
}
