/**
 * A black tape of scrolling one-liners: the app's promises, all of them true.
 * The line repeats twice so the loop has no seam; the copy is hidden from
 * assistive tech. It stops under prefers-reduced-motion. Never for status or
 * errors.
 */
export function Ticker({ items }: { items: readonly string[] }) {
  const tape = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      className="flex flex-none items-center"
    >
      {items.map((item) => (
        <li
          key={item}
          className="flex items-center gap-4 pr-4 text-xs leading-4 font-extrabold tracking-[0.08em] whitespace-nowrap uppercase"
        >
          {item}
          <span aria-hidden className="bg-primary size-2" />
        </li>
      ))}
    </ul>
  );
  return (
    <div
      aria-label="DeepRook in short"
      role="group"
      className="border-line bg-sticker-ink overflow-hidden border-b-3 py-1.5 text-white"
    >
      <div className="animate-ticker flex w-max motion-reduce:animate-none">
        {tape(false)}
        {tape(true)}
      </div>
    </div>
  );
}
