import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SelectProps = React.ComponentProps<'select'> & {
  /** Applied to the positioning wrapper rather than the `<select>` itself. */
  containerClassName?: string
}

/**
 * Native `<select>` with a consistent shell and a Lucide chevron. Native is deliberate:
 * it keeps the platform picker on mobile, where a custom popup is harder to operate.
 */
export function Select({ className, containerClassName, children, ...props }: SelectProps) {
  return (
    <span className={cn('relative inline-flex min-w-0', containerClassName)}>
      <select
        data-slot="select"
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent ps-3 pe-8 text-xs outline-none',
          'transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-55',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  )
}
