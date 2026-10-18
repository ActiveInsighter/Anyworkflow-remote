import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A row inside a `Card className="divide-y"` list: optional leading visual, a title line, a meta
 * line, and trailing actions that stay on the same row at every width.
 */
export function ListItem({
  leading,
  title,
  meta,
  children,
  actions,
  className,
}: {
  leading?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  /** Extra content under the meta line (tags, notes). */
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40 sm:px-4', className)}>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-body font-medium">{title}</div>
        {meta ? <div className="mt-1 truncate text-micro text-muted-foreground">{meta}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  )
}
