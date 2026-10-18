import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { StatusTone } from '@/types'

/** Status pill: tone colour plus a text label, so state never depends on colour alone. */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant={tone} className={cn('h-6 gap-1.5 text-caption', className)}>
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {children}
    </Badge>
  )
}

const dotTone: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/60',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/** Bare indicator dot; always place it next to visible or screen-reader text. */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', dotTone[tone], className)} />
}
