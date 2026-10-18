import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { StatusTone } from '@/types'

/** Progress bar with an optional mono percentage readout. Value is clamped to 0–100. */
export function ProgressMeter({
  value,
  tone = 'info',
  showValue = false,
  className,
}: {
  value: number
  tone?: StatusTone
  showValue?: boolean
  className?: string
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value)))
  const bar = <Progress value={percent} tone={tone} aria-label={`进度 ${percent}%`} className={showValue ? 'flex-1' : className} />
  if (!showValue) return bar
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {bar}
      <span className="font-mono text-micro text-muted-foreground tabular-nums">{percent}%</span>
    </div>
  )
}
