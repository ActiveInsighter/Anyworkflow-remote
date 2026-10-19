import type * as React from 'react'
import { CircleCheck, CircleDashed, CirclePause, CircleX, Clock3, LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StatusTone } from '@/types'

const softTone: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

const solidTone: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/45',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const textTone: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

function glyphIcon(tone: StatusTone, active: boolean): LucideIcon {
  if (active) return LoaderCircle
  if (tone === 'success') return CircleCheck
  if (tone === 'danger') return CircleX
  if (tone === 'info') return Clock3
  if (tone === 'warning') return CirclePause
  return CircleDashed
}

/**
 * Status mark at the start of a Task or Act row. The icon shape differs per state and the row
 * always carries the status label as text, so tone is never the only signal.
 */
export function StatusGlyph({
  tone,
  active = false,
  size = 'default',
  className,
}: {
  tone: StatusTone
  active?: boolean
  size?: 'default' | 'sm'
  className?: string
}) {
  const Icon = glyphIcon(tone, active)
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition-colors duration-base',
        size === 'default' ? 'size-8 [&_svg]:size-4' : 'size-6 [&_svg]:size-3.5',
        softTone[tone],
        className,
      )}
    >
      <Icon className={active ? 'animate-spin' : undefined} />
    </span>
  )
}

/** Timeline node for an Event. A live Event radiates a soft pulse. */
export function TimelineDot({ tone, active = false, className }: { tone: StatusTone; active?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative grid size-3 place-items-center', className)}>
      {active ? <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', solidTone[tone])} /> : null}
      <span className={cn('relative size-3 rounded-full ring-4 ring-card transition-colors duration-base', solidTone[tone])} />
    </span>
  )
}

/** Status label for a row's meta line, coloured by tone. */
export function StatusText({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={cn('font-medium', textTone[tone])}>{children}</span>
}
