import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

// Flat outlined button. Only `primary` keeps the hard offset shadow, so the one
// main action on a screen is the one that lifts; pressing sinks it into the
// shadow.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border-2 border-line bg-surface text-sm leading-4 font-bold whitespace-nowrap text-ink transition-[translate,box-shadow,background-color] duration-[80ms] ease-in-out select-none hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: '',
        primary:
          'bg-primary text-primary-foreground hover:bg-primary active:translate-x-0.5 active:translate-y-0.5',
        ghost: 'border-transparent bg-transparent',
        destructive: 'bg-loss text-sticker-ink hover:bg-loss',
      },
      size: {
        default: 'px-4 py-2.5',
        sm: 'px-3 py-1.5 text-[13px]',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
