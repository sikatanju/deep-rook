import type { ComponentProps, ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

/**
 * The container for every block on a page: Card plus a title and a
 * one-sentence subtitle.
 */
export function Panel({
  title,
  subtitle,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  title?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <Card className={className} {...props}>
      <CardContent className="flex flex-col gap-4">
        {(title || subtitle) && (
          <div>
            {title && (
              <h2 className="font-display text-2xl leading-7 font-extrabold tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && <p className="text-ink-muted mt-1">{subtitle}</p>}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
