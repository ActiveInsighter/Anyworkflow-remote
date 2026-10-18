import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

const indicatorVariants = cva('h-full w-full flex-1 transition-transform duration-slow ease-standard', {
  variants: {
    tone: {
      neutral: 'bg-muted-foreground',
      info: 'bg-info',
      success: 'bg-success',
      warning: 'bg-warning',
      danger: 'bg-danger',
      primary: 'bg-primary',
    },
  },
  defaultVariants: {
    tone: 'primary',
  },
})

function Progress({
  className,
  value,
  tone,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & VariantProps<typeof indicatorVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={indicatorVariants({ tone })}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
