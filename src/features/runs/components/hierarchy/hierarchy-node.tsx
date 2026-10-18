import type * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { StatusBadge } from '@/components/data-display/status-badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { StatusMeta } from '@/lib/domain/run-status'

/**
 * One expandable level of the Run → Task → Event → Act tree. Every level shares the same row
 * anatomy (chevron, index eyebrow, title, meta line, status), so depth reads from indentation
 * alone and touch targets stay consistent.
 */
export function HierarchyNode({
  id,
  open,
  onOpenChange,
  eyebrow,
  title,
  meta,
  badge,
  status,
  size = 'default',
  className,
  children,
}: {
  id?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  eyebrow: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  badge?: React.ReactNode
  status: StatusMeta
  size?: 'default' | 'sm'
  className?: string
  children: React.ReactNode
}) {
  return (
    <Collapsible id={id} open={open} onOpenChange={onOpenChange} className={cn('group/node min-w-0', className)}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 px-2 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4',
          size === 'default' ? 'min-h-16' : 'min-h-14',
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast group-data-[state=open]/node:rotate-90"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-medium text-muted-foreground">{eyebrow}</span>
          <span className={cn('mt-0.5 block truncate text-sm', size === 'default' ? 'font-semibold' : 'font-medium')}>
            {title}
          </span>
          {meta ? <span className="mt-1 block text-xs text-muted-foreground tabular-nums">{meta}</span> : null}
        </span>
        {badge}
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** Indented child rail beneath an open node. */
export function HierarchyChildren({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('ms-3 min-w-0 border-s ps-2 sm:ms-5 sm:ps-3', className)} {...props} />
}
