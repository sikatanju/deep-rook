import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** The page title. */
export function PageHeader({
  children,
  className,
  titleClassName,
}: {
  children: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={className}>
      <h1
        className={cn(
          'font-display text-[32px] leading-none font-extrabold tracking-[-0.02em]',
          titleClassName,
        )}
      >
        {children}
      </h1>
    </div>
  );
}
