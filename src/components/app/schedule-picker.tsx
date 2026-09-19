import { CalendarClock, Clock, TriangleAlert } from 'lucide-react'
import { Segmented, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  DELAY_PRESETS,
  describeSchedule,
  fromLocalInputValue,
  resolveDelayPreset,
  toLocalInputValue,
  type ScheduleMode,
} from '@/lib/schedule'

const MODE_OPTIONS: ReadonlyArray<{ value: ScheduleMode; label: string }> = [
  { value: 'now', label: '立即' },
  { value: 'at', label: '定时' },
  { value: 'after', label: '延时' },
]

/** A chip is "selected" when the stored instant is within half a minute of what it would produce. */
const PRESET_TOLERANCE_MS = 30_000

/**
 * Run-level execution time. `aw_dispatch_runs.scheduledAt` is a single instant, so 定时 and 延时 are
 * two ways to express the same value — clock time versus duration — and both end up in one field.
 */
export function SchedulePicker({
  mode,
  value,
  onModeChange,
  onValueChange,
  now,
  className,
}: {
  mode: ScheduleMode
  value: string
  onModeChange: (mode: ScheduleMode) => void
  onValueChange: (value: string) => void
  now: number
  className?: string
}) {
  const clock = new Date(now)
  const summary = describeSchedule(value, clock)
  const unresolved = mode !== 'now' && !value

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Segmented
          label="执行时间"
          value={mode}
          onChange={onModeChange}
          options={MODE_OPTIONS}
          className="w-full shrink-0 sm:w-[222px]"
        />

        {mode === 'at' ? (
          <TextInput
            type="datetime-local"
            aria-label="执行时刻"
            value={toLocalInputValue(value)}
            onChange={(event) => onValueChange(fromLocalInputValue(event.target.value))}
            className="w-full sm:w-[200px]"
          />
        ) : null}

        {mode === 'after' ? (
          <div className="flex flex-wrap gap-1.5">
            {DELAY_PRESETS.map((preset) => {
              const target = resolveDelayPreset(preset, clock)
              const selected = summary.set && Math.abs(target.getTime() - Date.parse(value)) < PRESET_TOLERANCE_MS
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onValueChange(target.toISOString())}
                  className={cn(
                    // 40px tall on touch, matching the editor toolbar; denser from sm up, where the
                    // chips sit inline with the 36px segmented control.
                    'inline-flex min-h-10 items-center justify-center rounded-md border px-2.5 text-[11px] font-medium outline-none transition-colors sm:min-h-7',
                    'focus-visible:ring-2 focus-visible:ring-ring/35',
                    selected
                      ? 'border-info/40 bg-info-soft text-info'
                      : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
        {unresolved ? (
          <>
            <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span className="text-warning">{mode === 'at' ? '请选择执行时刻' : '请选择一个延时'}</span>
          </>
        ) : mode === 'now' ? (
          <>
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <span>立即执行</span>
          </>
        ) : summary.pending ? (
          <>
            <Clock className="size-3.5 shrink-0 text-info" aria-hidden="true" />
            <span>
              <span className="text-info">{summary.absolute}</span> · {summary.relative}
            </span>
          </>
        ) : (
          <>
            <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span className="text-warning">该时刻已过，将立即执行</span>
          </>
        )}
      </p>
    </div>
  )
}

/** Row-sized marker for a Run that is queued but still waiting for its boundary. */
export function ScheduleBadge({ value, now }: { value: string; now: number }) {
  const summary = describeSchedule(value, new Date(now))
  if (!summary.set || !summary.pending) return null

  return (
    <Badge
      variant="plain"
      className="h-[22px] shrink-0 gap-1 rounded-md border-transparent bg-info-soft px-2 text-[11px] font-medium text-info"
    >
      <CalendarClock className="size-3" aria-hidden="true" />
      已定时 {summary.absolute}
    </Badge>
  )
}
