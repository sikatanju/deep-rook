import { Button } from '@/components/ui/button';
import type { Move } from '@/lib/chess/play';

const PROMOTIONS = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
] as const;

/** The choice a pawn reaching the last rank asks for. */
export function PromotionPicker({
  onPick,
}: {
  onPick: (piece: NonNullable<Move['promotion']>) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Promote to"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="font-bold">Promote to</span>
      {PROMOTIONS.map(({ piece, label }) => (
        <Button key={piece} size="sm" onClick={() => onPick(piece)}>
          {label}
        </Button>
      ))}
    </div>
  );
}
