import { BOARD_THEMES, type BoardTheme } from '@/app/store';
import { cn } from '@/lib/utils';

/**
 * Board colours as square swatches. `palette` follows the active palette; the
 * other four are the classic boards. The chosen swatch fills with `primary`
 * and lifts. Real radios underneath.
 */
export function BoardThemePicker({
  value,
  onChange,
}: {
  value: BoardTheme;
  onChange: (theme: BoardTheme) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-3 border-0 p-0">
      <legend className="sr-only">Board colors</legend>
      {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((name) => (
        <label
          key={name}
          className={cn(
            'border-line bg-surface text-ink has-[:focus-visible]:outline-focus flex cursor-pointer flex-col items-center gap-1 rounded-sm border-2 p-2 font-bold capitalize has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2',
            value === name &&
              'bg-primary text-sticker-ink -translate-x-0.5 -translate-y-0.5',
          )}
        >
          <input
            type="radio"
            name="board-theme"
            className="sr-only"
            checked={value === name}
            onChange={() => onChange(name)}
          />
          <span
            aria-hidden
            className="border-line grid size-12 grid-cols-2 border-2"
          >
            {[0, 1, 1, 0].map((dark, i) => (
              <span
                key={i}
                style={{
                  background: dark
                    ? BOARD_THEMES[name].dark
                    : BOARD_THEMES[name].light,
                }}
              />
            ))}
          </span>
          {name}
        </label>
      ))}
    </fieldset>
  );
}
