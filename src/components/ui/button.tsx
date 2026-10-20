import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

// Neo-brutal push button. A hard offset shadow rests under it, hover lifts it a
// pixel and grows the shadow one step, and pressing sinks it by the shadow's
// distance until the shadow is gone. Labels are UPPERCASE through CSS only, so
// the DOM text (and every test query on it) stays sentence case.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border-3 border-line bg-surface text-[13px] leading-4 font-extrabold tracking-[0.06em] whitespace-nowrap text-ink uppercase shadow-md transition-[translate,box-shadow] duration-[80ms] ease-in-out select-none hover:-translate-x-px hover:-translate-y-px hover:shadow-lg active:translate-x-1 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:translate-x-0 disabled:translate-y-0 disabled:opacity-55 disabled:shadow-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: '',
        primary: 'bg-primary text-sticker-ink',
        accent: 'bg-accent text-sticker-ink',
        ghost: 'border-dashed bg-transparent',
        destructive: 'bg-loss text-sticker-ink',
        link: 'border-transparent bg-transparent normal-case shadow-none hover:translate-x-0 hover:translate-y-0 hover:shadow-none hover:underline active:translate-x-0 active:translate-y-0',
      },
      size: {
        default: 'px-4 py-2.5',
        lg: 'px-5 py-3',
        sm: 'px-3 py-1.5 text-[11px] shadow-sm hover:shadow-md active:translate-x-0.5 active:translate-y-0.5',
        xs: 'px-2 py-1 text-[10px] shadow-sm hover:shadow-md active:translate-x-0.5 active:translate-y-0.5',
        icon: 'size-10',
        'icon-sm':
          'size-8 shadow-sm hover:shadow-md active:translate-x-0.5 active:translate-y-0.5',
        'icon-xs':
          "size-6 shadow-sm hover:shadow-md active:translate-x-0.5 active:translate-y-0.5 [&_svg:not([class*='size-'])]:size-3",
        'icon-lg': 'size-12',
      },
    },
    compoundVariants: [
      {
        variant: 'ghost',
        class:
          'shadow-none hover:translate-x-0 hover:translate-y-0 hover:bg-surface-alt hover:shadow-none active:translate-x-0 active:translate-y-0',
      },
    ],
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
