import type { LucideIcon } from 'lucide-react';

import { PaletteSwitcher } from '@/components/layout/palette-switcher';
import type { PaletteId } from '@/lib/palettes';
import { cn } from '@/lib/utils';

export type NavItem<Id extends string> = {
  id: Id;
  label: string;
  icon: LucideIcon;
};

/**
 * Left rail on wide screens: logo tile, page links as pills, the palette
 * switcher pinned to the bottom. On small screens it is a top bar with the
 * links as a fixed bottom bar; the palette lives in Settings there.
 */
export function NavRail<Id extends string>({
  active,
  items,
  palette,
  onPalette,
}: {
  active: Id;
  items: readonly NavItem<Id>[];
  palette: PaletteId;
  onPalette: (id: PaletteId) => void;
}) {
  return (
    <aside className="border-line bg-surface flex items-center justify-between border-b-3 p-4 md:sticky md:top-0 md:h-svh md:flex-col md:items-stretch md:justify-start md:gap-2 md:border-r-3 md:border-b-0 md:px-4 md:py-6">
      <a
        href="#/games"
        className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-[-0.02em] md:mb-4"
      >
        {/* The rook glyph on a tilted tile is a placeholder mark, not a drawn logo. */}
        <span
          aria-hidden
          className="border-line bg-primary text-sticker-ink grid size-9 -rotate-6 place-items-center rounded-sm border-3 text-[22px] shadow-sm"
        >
          ♜
        </span>
        DeepRook
      </a>
      <nav
        aria-label="Main"
        className="border-line bg-surface fixed inset-x-0 bottom-0 z-10 flex justify-around border-t-3 p-1 md:static md:flex-col md:justify-start md:gap-2 md:border-0 md:bg-transparent md:p-0"
      >
        {items.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#/${id}`}
            aria-current={id === active ? 'page' : undefined}
            className={cn(
              'md:rounded-pill text-ink hover:border-line hover:bg-surface-alt flex flex-1 flex-col items-center gap-0.5 rounded-sm border-3 border-transparent px-3 py-2 text-xs font-bold md:flex-none md:flex-row md:gap-3 md:py-2.5 md:text-[15px]',
              'aria-[current=page]:border-line aria-[current=page]:bg-accent aria-[current=page]:text-sticker-ink aria-[current=page]:shadow-sm md:aria-[current=page]:shadow-md',
            )}
          >
            <Icon aria-hidden className="size-5" />
            {label}
          </a>
        ))}
      </nav>
      <div className="hidden md:mt-auto md:block">
        <PaletteSwitcher value={palette} onChange={onPalette} />
      </div>
    </aside>
  );
}
