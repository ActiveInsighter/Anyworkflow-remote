import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface DescriptionItem {
  label: React.ReactNode
  value: React.ReactNode
}

/** Aligned label/value metadata, two columns on mobile and up to four from `sm`. */
export function DescriptionList({
  items,
  columns = 4,
  className,
}: {
  items: DescriptionItem[]
  columns?: 2 | 3 | 4
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-5 gap-y-4 sm:gap-x-7',
        columns === 3 && 'sm:grid-cols-3',
        columns === 4 && 'sm:grid-cols-4',
        className,
      )}
    >
      {items.map((item, index) => (
        <div className="min-w-0" key={index}>
          <dt className="text-caption font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-body font-medium break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
