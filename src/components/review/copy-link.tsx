import { CheckIcon, LinkIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Replay } from '@/lib/chess/replay';
import { shareUrl, type Side } from '@/lib/share/link';
import { cn } from '@/lib/utils';

type Copy =
  | { status: 'idle' }
  | { status: 'copied' }
  /** No clipboard, or it said no: the link sits in a field to copy by hand. */
  | { status: 'manual'; url: string };

/** Copies a link that opens this game's review, the board seen from `side`. */
export function CopyLink({ replay, side }: { replay: Replay; side: Side }) {
  const [copy, setCopy] = useState<Copy>({ status: 'idle' });
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const manualUrl = copy.status === 'manual' ? copy.url : null;

  useEffect(() => {
    if (copy.status !== 'copied') return;
    const t = setTimeout(() => setCopy({ status: 'idle' }), 2000);
    return () => clearTimeout(t);
  }, [copy]);

  // Selected, so the clipboard shortcut copies it straight away.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [manualUrl]);

  async function onCopy() {
    const url = await shareUrl(
      replay,
      side,
      location.origin + location.pathname,
    );
    try {
      await navigator.clipboard.writeText(url);
      setCopy({ status: 'copied' });
    } catch {
      setCopy({ status: 'manual', url });
    }
  }

  const copied = copy.status === 'copied';
  // The note and the field float above the page: the step-button row beside
  // the board has a fixed height at xl and no room for either.
  const floating =
    'fixed inset-x-4 bottom-24 z-30 md:bottom-6 md:left-auto md:w-[28rem]';
  return (
    <>
      <Button
        size="icon-sm"
        aria-label="Copy link"
        title="Copy link"
        onClick={onCopy}
      >
        {copied ? <CheckIcon aria-hidden /> : <LinkIcon aria-hidden />}
      </Button>
      <div
        aria-live="polite"
        className={cn(floating, 'pointer-events-none flex justify-end')}
      >
        {copied && (
          <p className="border-line bg-surface rounded-sm border-3 px-3 py-2 font-extrabold shadow-md">
            Link copied
          </p>
        )}
      </div>
      {manualUrl && (
        <div
          className={cn(
            floating,
            'border-line bg-surface flex flex-col gap-2 rounded-md border-3 p-4 shadow-lg',
          )}
        >
          <label htmlFor={id} className="font-bold">
            Copy this link to share the game
          </label>
          <Input
            id={id}
            ref={field}
            readOnly
            value={manualUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            className="self-end"
            onClick={() => setCopy({ status: 'idle' })}
          >
            Done
          </Button>
        </div>
      )}
    </>
  );
}
