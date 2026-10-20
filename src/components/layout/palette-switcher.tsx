import { PALETTES, type PaletteId } from '@/lib/palettes';

/** Eight split discs, one per palette; Arcade Night, the dark one, is last. */
export function PaletteSwitcher({
  value,
  onChange,
}: {
  value: PaletteId;
  onChange: (id: PaletteId) => void;
}) {
  return (
    <div role="group" aria-label="Palette" className="flex flex-wrap gap-2">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-label={p.name}
          title={p.name}
          aria-pressed={value === p.id}
          onClick={() => onChange(p.id)}
          className="rounded-pill aria-pressed:outline-focus size-[30px] cursor-pointer border-3 shadow-sm transition-[transform,box-shadow] duration-100 aria-pressed:translate-x-0.5 aria-pressed:translate-y-0.5 aria-pressed:shadow-none aria-pressed:outline-[3px] aria-pressed:outline-offset-2"
          style={{
            background: `linear-gradient(90deg, ${p.a} 50%, ${p.b} 50%)`,
          }}
        />
      ))}
    </div>
  );
}
