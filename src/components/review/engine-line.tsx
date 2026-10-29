import { numberedSan, sanLine } from '@/lib/chess/replay';

/** Plies shown: enough to see the plan, few enough to stay a line. */
const SHOWN = 8;

/**
 * The engine's continuation from `fen` as a score sheet. Each move plays the
 * line out on the board up to and including itself.
 */
export function EngineLine({
  fen,
  pv,
  eval: score,
  onPlay,
}: {
  fen: string;
  pv: readonly string[];
  /** Already formatted: "+0.4". */
  eval?: string;
  onPlay: (plies: number) => void;
}) {
  const sans = sanLine(fen, pv.slice(0, SHOWN));
  if (sans.length === 0) return null;
  const labels = numberedSan(fen, sans);
  return (
    <div role="group" aria-label="Engine line">
      <p className="text-ink-muted mb-1 text-xs leading-4 font-bold">
        Engine line
        {score && <span className="font-mono normal-case"> {score}</span>}
      </p>
      <div className="flex flex-wrap gap-x-1 gap-y-0.5 font-mono text-sm font-bold">
        {labels.map((label, i) => (
          <button
            key={i}
            type="button"
            title="Play the line to here"
            className="hover:bg-surface-alt focus-visible:outline-line cursor-pointer rounded-sm px-1 py-0.5 hover:underline"
            onClick={() => onPlay(i + 1)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
