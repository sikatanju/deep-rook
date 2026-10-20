import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** The one highlighted word of a page title, on a tilted `primary` block. */
export function Highlight({ children }: { children: ReactNode }) {
  return (
    <mark className="border-line bg-primary text-sticker-ink inline-block -rotate-2 border-3 px-2 shadow-sm">
      {children}
    </mark>
  );
}

/** A small UPPERCASE eyebrow over the page title. Sentence case, one Highlight. */
export function PageHeader({
  eyebrow,
  children,
  className,
  titleClassName,
}: {
  eyebrow: string;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={className}>
      <p className="text-ink-muted text-xs leading-4 font-extrabold tracking-[0.08em] uppercase">
        {eyebrow}
      </p>
      <h1
        className={cn(
          'font-display mt-1.5 text-[44px] leading-none font-extrabold tracking-[-0.02em]',
          titleClassName,
        )}
      >
        {children}
      </h1>
    </div>
  );
}
