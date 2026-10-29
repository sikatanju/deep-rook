import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { moveFromSan, type Move } from '@/lib/chess/play';

/**
 * A labelled field that plays a move typed in SAN from `fen`. Text that is no
 * legal move, or names more than one, plays nothing and says so inline.
 */
export function TypedMove({
  fen,
  label,
  onMove,
}: {
  fen: string;
  label: string;
  onMove: (m: Move) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const move = moveFromSan(fen, text);
    setError(!move);
    if (!move) return;
    setText('');
    onMove(move);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. Nf3"
          aria-invalid={error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
        />
        <Button type="submit">Play</Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-ink font-bold">
          That is not a legal move here.
        </p>
      )}
    </form>
  );
}
