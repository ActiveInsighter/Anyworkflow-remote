import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Where new work starts: the one raised surface on a tool page. Everything it needs to begin is
 * in view; less common choices fold into it. `dragging` lights it up as a drop target.
 */
export function Composer({ dragging = false, className, ...props }: React.ComponentProps<'form'> & { dragging?: boolean }) {
  return (
    <form
      data-slot="composer"
      data-dragging={dragging || undefined}
      className={cn(
        'relative flex min-w-0 flex-col rounded-2xl bg-card shadow-raised transition-shadow duration-fast',
        'data-dragging:ring-2 data-dragging:ring-primary',
        className,
      )}
      {...props}
    />
  )
}

/** The primary input area of a composer. */
export function ComposerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="composer-body" className={cn('min-w-0 p-3 sm:p-4', className)} {...props} />
}

/** The closing bar: what this submission will do on the left, the action on the right. */
export function ComposerBar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="composer-bar"
      className={cn('flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t px-3 py-2.5 sm:px-4', className)}
      {...props}
    />
  )
}
