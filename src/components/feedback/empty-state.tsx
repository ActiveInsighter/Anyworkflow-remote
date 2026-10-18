import type * as React from 'react'
import { CircleDashed, type LucideIcon } from 'lucide-react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

/** Standard empty result: icon, one-line title, optional hint and a single next action. */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = CircleDashed,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
