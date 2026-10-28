import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  type LucideIcon,
} from 'lucide-react';

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
 * Left rail on wide screens: logo tile and page links as pills, with any
 * `pinned` link at the bottom. Collapsed, the rail keeps only the icons. On
 * small screens it is a top bar with the links as a fixed bottom bar, and
 * collapsing does not apply.
 */
export function NavRail<Id extends string>({
  active,
  items,
  collapsed = false,
  onToggle,
}: {
  active: Id;
  items: readonly NavItem<Id>[];
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  // Names stay in the DOM when collapsed, so links keep their accessible name.
  const hideLabel = collapsed && 'md:sr-only';
  const pill =
    'md:rounded-pill text-ink hover:border-line hover:bg-surface-alt flex flex-1 flex-col items-center gap-0.5 rounded-sm border-3 border-transparent px-3 py-2 text-xs font-bold md:flex-none md:flex-row md:gap-3 md:py-2.5 md:text-[15px]';
  return (
    <aside
      className={cn(
        'border-line bg-surface flex items-center justify-between border-b-3 p-4 md:sticky md:top-0 md:h-svh md:flex-col md:items-stretch md:justify-start md:gap-2 md:border-r-3 md:border-b-0 md:py-6',
        collapsed ? 'md:px-3' : 'md:px-4',
      )}
    >
      <a
        href="#/games"
        title={collapsed ? 'DeepRook' : undefined}
        className={cn(
          'font-display flex items-center gap-2 text-2xl font-extrabold tracking-[-0.02em] md:mb-4',
          collapsed && 'md:justify-center',
        )}
      >
        {/* The rook glyph on a tilted tile is a placeholder mark, not a drawn logo. */}
        <span
          aria-hidden
          className="border-line bg-primary text-sticker-ink grid size-9 -rotate-6 place-items-center rounded-sm border-3 text-[22px] shadow-sm"
        >
          ♜
        </span>
        <span className={hideLabel || undefined}>DeepRook</span>
      </a>
      <nav
        aria-label="Main"
        className="border-line bg-surface fixed inset-x-0 bottom-0 z-10 flex justify-around border-t-3 p-1 md:static md:flex-1 md:flex-col md:justify-start md:gap-2 md:border-0 md:bg-transparent md:p-0"
      >
        {items.map(({ id, label, icon: Icon, pinned, badge }) => (
          <a
            key={id}
            href={`#/${id}`}
            aria-current={id === active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              'relative',
              pinned && 'md:mt-auto',
              pill,
              collapsed && 'md:justify-center md:px-0',
              'aria-[current=page]:border-line aria-[current=page]:bg-accent aria-[current=page]:text-sticker-ink aria-[current=page]:shadow-sm md:aria-[current=page]:shadow-md',
            )}
          >
            <Icon aria-hidden className="size-5" />
            <span className={hideLabel || undefined}>{label}</span>
            {!!badge && (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'border-line bg-primary text-sticker-ink rounded-pill absolute top-0 right-1 min-w-5 border-2 px-1 text-center font-mono text-[11px] leading-4 font-extrabold',
                    !collapsed && 'md:static md:ml-auto',
                  )}
                >
                  {badge}
                </span>
                <span className="sr-only">, {badge} due</span>
              </>
            )}
          </a>
        ))}
      </nav>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            pill,
            'hidden cursor-pointer md:flex',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          {collapsed ? (
            <PanelLeftOpenIcon aria-hidden className="size-5" />
          ) : (
            <PanelLeftCloseIcon aria-hidden className="size-5" />
          )}
          <span className={hideLabel || undefined}>
            {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          </span>
        </button>
      )}
    </aside>
  );
}
