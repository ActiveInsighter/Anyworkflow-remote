import type * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * One expandable row of the execution tree. Every level shares the anatomy (leading status mark,
 * title, meta line, trailing chevron); the level decides spacing and type weight. The chevron
 * reads its own trigger's state, so a closed child inside an open parent always shows closed.
 */
export function RecordNode({
  ref,
  id,
  level,
  open,
  onOpenChange,
  leading,
  title,
  meta,
  footer,
  trailing,
  className,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>
  id?: string
  level: 'task' | 'event' | 'act'
  open: boolean
  onOpenChange: (open: boolean) => void
  leading?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  /** Extra header content under the meta line, such as a progress bar. */
  footer?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Collapsible ref={ref} id={id} open={open} onOpenChange={onOpenChange} className={cn('min-w-0 scroll-mt-20', className)}>
      <CollapsibleTrigger
        className={cn(
          'group/trigger flex w-full items-start text-left outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          level === 'task' && 'min-h-16 gap-3 px-3 py-3 hover:bg-muted/40 sm:px-4',
          level === 'event' && 'min-h-14 gap-2 rounded-md px-2 py-2.5 hover:bg-muted/50',
          level === 'act' && 'min-h-12 gap-2.5 px-3 py-2.5 hover:bg-muted/40',
        )}
      >
        {leading}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 block break-words',
              level === 'task' ? 'text-sm font-semibold tracking-snug' : 'text-body font-medium',
              level === 'task' ? 'mt-px' : null,
            )}
          >
            {title}
          </span>
          {meta ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
              {meta}
            </span>
          ) : null}
          {footer}
        </span>
        {trailing}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-base ease-standard group-data-[state=open]/trigger:rotate-180',
            level === 'task' ? 'mt-2 size-4' : 'mt-0.5 size-4',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-disclosure">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** Separator for meta-line fragments. */
export function MetaDot() {
  return (
    <span aria-hidden="true" className="text-border-strong">
      ·
    </span>
  )
}

/** Compact loading line for a nested level; a full LoadingState block would shift the tree. */
export function InlineLoading({ label, className }: { label: string; className?: string }) {
  return (
    <p role="status" className={cn('flex items-center gap-2 py-3 text-xs text-muted-foreground', className)}>
      <Spinner className="size-3.5" />
      {label}
    </p>
  )
}

/** Quiet one-line explanation where a level has nothing to list yet. */
export function InlineNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="status" className={cn('py-3 text-xs text-muted-foreground', className)}>
      {children}
    </p>
  )
}
