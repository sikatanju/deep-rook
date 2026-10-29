import * as React from 'react';
import { cn } from 'cn';

// A native range input, so the keyboard and form behaviour are the browser's.
function Slider({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="range"
      data-slot="slider"
      className={cn(
        'rounded-pill border-line bg-surface-alt [&::-moz-range-thumb]:border-line [&::-moz-range-thumb]:bg-accent [&::-webkit-slider-thumb]:border-line [&::-webkit-slider-thumb]:bg-accent h-3.5 w-full cursor-pointer appearance-none border-2 disabled:cursor-not-allowed disabled:opacity-55 [&::-moz-range-thumb]:size-[22px] [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-2 [&::-webkit-slider-thumb]:size-[26px] [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border-2',
        className,
      )}
      {...props}
    />
  );
}

export { Slider };
