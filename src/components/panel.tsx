import type { ComponentProps, ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The container for every block on a page: Card plus a title, a one-sentence
 * subtitle, and a tilted `accent` tag naming the panel's mode ("Online",
 * "Saved here"). One word per tag, one tag per panel.
 */
export function Panel({
  title,
  subtitle,
  tag,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  title?: ReactNode;
  subtitle?: ReactNode;
  tag?: string;
}) {
  return (
    <Card className={cn('relative', className)} {...props}>
      {tag && (
        <span className="border-line bg-accent text-sticker-ink absolute -top-3.5 left-4 -rotate-3 rounded-sm border-2 px-2 py-0.5 text-xs leading-4 font-extrabold tracking-[0.08em] uppercase shadow-sm">
          {tag}
        </span>
      )}
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
