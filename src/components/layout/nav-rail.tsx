import { type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type NavItem<Id extends string> = {
  id: Id;
  label: string;
  icon: LucideIcon;
  /** On wide screens, sit at the bottom of the rail instead of with the rest. */
  pinned?: boolean;
  /** A count shown on the link, such as drills due. Nothing at 0. */
  badge?: number;
};

/**
 * Left rail on wide screens: logo and page links, with any `pinned` link at
 * the bottom. On small screens it is a top bar with the links as a fixed
 * bottom bar.
 */
export function NavRail<Id extends string>({
  active,
  items,
}: {
  active: Id;
  items: readonly NavItem<Id>[];
}) {
  return (
    <aside className="border-line bg-surface flex items-center justify-between border-b-2 p-4 md:sticky md:top-0 md:h-svh md:flex-col md:items-stretch md:justify-start md:gap-2 md:border-r-2 md:border-b-0 md:px-4 md:py-6">
      <a
        href="#/games"
        className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-[-0.02em] md:mb-4"
      >
        {/* The rook glyph on a tile is a placeholder mark, not a drawn logo. */}
        <span
          aria-hidden
          className="border-line bg-primary text-sticker-ink grid size-9 place-items-center rounded-sm border-2 text-[22px]"
        >
          ♜
        </span>
        DeepRook
      </a>
      <nav
        aria-label="Main"
        className="border-line bg-surface fixed inset-x-0 bottom-0 z-10 flex justify-around border-t-2 p-1 md:static md:flex-1 md:flex-col md:justify-start md:gap-1 md:border-0 md:bg-transparent md:p-0"
      >
        {items.map(({ id, label, icon: Icon, pinned, badge }) => (
          <a
            key={id}
            href={`#/${id}`}
            aria-current={id === active ? 'page' : undefined}
            className={cn(
              'text-ink hover:bg-surface-alt aria-[current=page]:bg-surface-alt relative flex flex-1 flex-col items-center gap-0.5 rounded-sm px-3 py-2 text-xs font-bold md:flex-none md:flex-row md:gap-3 md:py-2.5 md:text-[15px]',
              pinned && 'md:mt-auto',
            )}
          >
            <Icon aria-hidden className="size-5" />
            <span>{label}</span>
            {!!badge && (
              <>
                <span
                  aria-hidden
                  className="border-line bg-primary text-sticker-ink rounded-pill absolute top-0 right-1 min-w-5 border-2 px-1 text-center font-mono text-[11px] leading-4 font-extrabold md:static md:ml-auto"
                >
                  {badge}
                </span>
                <span className="sr-only">, {badge} due</span>
              </>
            )}
          </a>
        ))}
      </nav>
    </aside>
  );
}
