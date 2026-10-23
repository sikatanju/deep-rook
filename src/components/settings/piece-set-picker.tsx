import { PIECE_SETS, pieceSrc, type PieceSet } from '@/app/store';
import { cn } from '@/lib/utils';

export function PieceSetPicker({
  value,
  onChange,
}: {
  value: PieceSet;
  onChange: (set: PieceSet) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-3 border-0 p-0">
      <legend className="sr-only">Pieces</legend>
      {(Object.keys(PIECE_SETS) as PieceSet[]).map((id) => (
        <label
          key={id}
          className={cn(
            'border-line bg-surface text-ink has-[:focus-visible]:outline-focus flex cursor-pointer flex-col items-center gap-1 rounded-sm border-3 p-2 font-bold shadow-sm has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2',
            value === id &&
              'bg-primary text-sticker-ink -translate-x-0.5 -translate-y-0.5 shadow-md',
          )}
        >
          <input
            type="radio"
            name="piece-set"
            className="sr-only"
            checked={value === id}
            onChange={() => onChange(id)}
          />
          <span aria-hidden className="flex">
            <img
              alt=""
              draggable={false}
              src={pieceSrc(id, 'wN')}
              className="size-10"
            />
            <img
              alt=""
              draggable={false}
              src={pieceSrc(id, 'bN')}
              className="size-10"
            />
          </span>
          {PIECE_SETS[id].name}
        </label>
      ))}
    </fieldset>
  );
}
