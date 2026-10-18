import { CircleCheck, CircleDashed, CircleDot, CircleX, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DispatchStatus, StatusTone } from '@/types'

const icons: Record<DispatchStatus, LucideIcon> = {
  draft: CircleDashed,
  queued: CircleDot,
  running: CircleDot,
  succeeded: CircleCheck,
  failed: CircleX,
  canceled: CircleX,
}

const tones: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/** Leading status glyph for list rows. Decorative: the row also renders a text status badge. */
export function RunStatusIcon({ status, tone, className }: { status: DispatchStatus; tone: StatusTone; className?: string }) {
  const Icon = icons[status] ?? CircleDashed
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0', tones[tone], className)} />
}
