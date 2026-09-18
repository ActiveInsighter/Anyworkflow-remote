import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,color,border-color,opacity] outline-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[var(--ui-ring)]/35 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[var(--ui-primary)] text-[var(--ui-primary-foreground)] hover:opacity-90',
        destructive: 'bg-[var(--ui-destructive)] text-white hover:opacity-90',
        outline: 'border border-[var(--ui-input)] bg-transparent text-[var(--ui-foreground)] hover:bg-[var(--ui-accent)] hover:text-[var(--ui-accent-foreground)]',
        secondary: 'bg-[var(--ui-secondary)] text-[var(--ui-secondary-foreground)] hover:opacity-85',
        ghost: 'text-[var(--ui-foreground)] hover:bg-[var(--ui-muted)]',
        link: 'text-[var(--ui-foreground)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 gap-1.5 rounded-md px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
