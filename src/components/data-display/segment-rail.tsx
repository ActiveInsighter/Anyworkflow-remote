import { cn } from '@/lib/utils'
import type { StatusTone } from '@/types'

/** Past this, segments would be hairlines; the rail groups its units into this many cells. */
const MAX_CELLS = 24

const fill: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/60',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/**
 * Progress counted in real units: the phases of a job or the Tasks of a Run, one segment each.
 * With `live`, the first unfinished segment breathes, so it shows what is being worked on rather
 * than pretending to a percentage nobody measured.
 */
export function SegmentRail({
  total,
  done,
  live = false,
  tone = 'info',
  label,
  className,
}: {
  total: number
  done: number
  live?: boolean
  tone?: StatusTone
  /** Accessible name; the value reads as "done of total". */
  label: string
  className?: string
}) {
  const units = Math.max(1, Math.round(total))
  const finished = Math.min(Math.max(0, Math.round(done)), units)
  const cells = Math.min(units, MAX_CELLS)
  const filled = cells === units ? finished : Math.floor((finished / units) * cells)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={units}
      aria-valuenow={finished}
      aria-valuetext={`${finished} / ${units}`}
      className={cn('flex h-1.5 w-full gap-0.5', className)}
    >
      {Array.from({ length: cells }, (_, index) => (
        <span key={index} className="relative h-full min-w-0 flex-1 overflow-hidden rounded-[2px] bg-border">
          {index < filled ? <span className={cn('absolute inset-0', fill[tone])} /> : null}
          {live && index === filled ? <span className={cn('absolute inset-0 animate-rail', fill[tone])} /> : null}
        </span>
      ))}
    </div>
  )
}
