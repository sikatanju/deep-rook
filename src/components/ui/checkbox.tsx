import * as React from 'react';
import { cn } from 'cn';

// A native checkbox, so labels, form state and keyboard come for free.
function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "border-line bg-surface checked:bg-primary checked:after:border-sticker-ink m-0 grid size-6 shrink-0 cursor-pointer appearance-none place-items-center rounded-sm border-3 shadow-sm checked:after:h-[5px] checked:after:w-2.5 checked:after:-translate-y-0.5 checked:after:-rotate-45 checked:after:border-b-3 checked:after:border-l-3 checked:after:content-[''] disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
