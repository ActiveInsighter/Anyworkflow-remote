import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Page frame inside the app shell's scroll host. `width` picks the content measure:
 * `page` for lists and dashboards, `detail` for single-record views.
 */
export function Page({
  width = 'page',
  className,
  ...props
}: React.ComponentProps<'div'> & { width?: 'page' | 'detail' }) {
  return (
    <div
      data-slot="page"
      className={cn(
        'mx-auto w-full px-4 pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-7 sm:pt-8 sm:pb-16 lg:px-10 lg:pt-10',
        width === 'page' ? 'max-w-page' : 'max-w-detail',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Title row for a page. Actions wrap below the title on narrow screens; pass `compact` to keep
 * them on the title row (icon-sized actions only) and hide the description on mobile.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  compact = false,
  wrapTitle = false,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  compact?: boolean
  /** Long record names wrap instead of truncating. */
  wrapTitle?: boolean
  className?: string
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        'mb-5 flex gap-3 sm:mb-7 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        compact ? 'flex-row items-center justify-between' : 'flex-col',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2 text-caption font-medium text-muted-foreground">{eyebrow}</div>
        ) : null}
        <h1
          className={cn(
            'text-title font-semibold sm:text-display',
            wrapTitle ? 'break-words whitespace-normal' : 'truncate',
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className={cn('mt-1.5 max-w-2xl text-body text-muted-foreground', compact && 'hidden sm:block')}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            'flex items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end sm:pt-0.5',
            compact ? 'shrink-0' : 'w-full flex-wrap',
          )}
        >
          {actions}
        </div>
      ) : null}
    </header>
  )
}

/** Heading for a group of content within a page, with optional trailing metadata or actions. */
export function SectionHeader({
  title,
  description,
  trailing,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div data-slot="section-header" className={cn('mb-2.5 flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-snug">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {trailing ? <div className="shrink-0 text-caption text-muted-foreground tabular-nums">{trailing}</div> : null}
    </div>
  )
}
