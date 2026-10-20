import * as React from 'react';
import { cn } from 'cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-line bg-surface-alt text-ink placeholder:text-ink-muted aria-invalid:border-destructive w-full min-w-0 rounded-sm border-3 px-3 py-2.5 font-bold shadow-[inset_3px_3px_0_0_rgb(0_0_0/0.08)] file:inline-flex file:border-0 file:bg-transparent file:font-bold placeholder:font-medium disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
