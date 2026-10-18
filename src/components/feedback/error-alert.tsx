import type * as React from 'react'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

/**
 * Failure message. Page-level by default; `inline` for failures scoped to a panel, row or dialog.
 * Renders nothing for an empty message so callers can pass state through unconditionally.
 */
export function ErrorAlert({
  children,
  inline = false,
  className,
}: {
  children: React.ReactNode
  inline?: boolean
  className?: string
}) {
  if (children === '' || children == null || children === false) return null
  const Icon = inline ? TriangleAlert : CircleAlert
  return (
    <Alert variant="destructive" size={inline ? 'sm' : 'default'} className={cn(!inline && 'mb-4', className)}>
      <Icon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
