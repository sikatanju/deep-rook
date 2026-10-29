import { Button } from '@/components/ui/button';

export const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * One filter's choices as a row of toggle chips: the Overview's filters and
 * the Games list's share it. `any` names the choice that filters nothing.
 */
export function FilterChips<T extends string>({
  label,
  any,
  options,
  value,
  onChange,
}: {
  label: string;
  any: { id: T; name: string };
  options: readonly { id: T; name: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {[any, ...options].map(({ id, name }) => (
        <Button
          key={id}
          size="sm"
          variant={value === id ? 'primary' : 'default'}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {name}
        </Button>
      ))}
    </div>
  );
}
