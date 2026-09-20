import { CalendarClock, Clock, TriangleAlert } from 'lucide-react'
import { Segmented, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  describeSchedule,
  fromLocalInputValue,
  minimumScheduleTime,
  toLocalInputValue,
  type DelayUnit,
  type ScheduleMode,
} from '@/lib/schedule'

const MODE_OPTIONS: ReadonlyArray<{ value: ScheduleMode; label: string }> = [
  { value: 'now', label: '立即' },
  { value: 'at', label: '定时' },
  { value: 'after', label: '延时' },
]

const DELAY_UNITS: ReadonlyArray<{ value: DelayUnit; label: string }> = [
  { value: 'minute', label: '分钟' },
  { value: 'hour', label: '小时' },
  { value: 'day', label: '天' },
]

/**
 * Run-level execution time. `aw_dispatch_runs.scheduledAt` stores one absolute instant; the
 * controls below only provide different ways to produce that instant.
 */
export function SchedulePicker({
  mode,
  value,
  onModeChange,
  onValueChange,
  delayAmount,
  delayUnit,
  onDelayAmountChange,
  onDelayUnitChange,
  now,
  className,
}: {
  mode: ScheduleMode
  value: string
  onModeChange: (mode: ScheduleMode) => void
  onValueChange: (value: string) => void
  delayAmount: string
  delayUnit: DelayUnit
  onDelayAmountChange: (value: string) => void
  onDelayUnitChange: (unit: DelayUnit) => void
  now: number
  className?: string
}) {
  const clock = new Date(now)
  const summary = describeSchedule(value, clock)
  const unresolved = mode !== 'now' && !value
  const expired = mode !== 'now' && Boolean(value) && !summary.pending
  const invalid = unresolved || expired
  const minimum = toLocalInputValue(minimumScheduleTime(clock))

  return (
    <div className={cn('grid gap-4', className)}>
      <div className="grid gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">执行方式</span>
        <Segmented
          label="执行方式"
          value={mode}
          onChange={onModeChange}
          options={MODE_OPTIONS}
          className="h-10 w-full"
        />
      </div>

      {mode === 'at' ? (
        <div className="grid gap-1.5">
          <label htmlFor="run-scheduled-at" className="text-[11px] font-medium text-muted-foreground">
            执行时间
          </label>
          <TextInput
            id="run-scheduled-at"
            type="datetime-local"
            aria-invalid={invalid || undefined}
            min={minimum}
            value={toLocalInputValue(value)}
            onChange={(event) => onValueChange(fromLocalInputValue(event.target.value))}
            className={cn('h-10 w-full', invalid && 'border-danger focus-visible:border-danger')}
          />
        </div>
      ) : null}

      {mode === 'after' ? (
        <div className="grid gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">延时时长</span>
          <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-label="延时时长"
              aria-invalid={invalid || undefined}
              value={delayAmount}
              onChange={(event) => onDelayAmountChange(event.target.value)}
              className={cn('h-10', invalid && 'border-danger focus-visible:border-danger')}
            />
            <Select
              aria-label="延时单位"
              value={delayUnit}
              onChange={(event) => onDelayUnitChange(event.target.value as DelayUnit)}
              className="h-10"
            >
              {DELAY_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-h-11 items-start gap-2 rounded-md border border-border bg-muted/35 px-3 py-2.5 text-xs leading-5',
          invalid ? 'border-warning/30 bg-warning-soft text-warning' : 'text-muted-foreground',
        )}
        role={invalid ? 'alert' : 'status'}
      >
        {invalid ? (
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Clock className={cn('mt-0.5 size-3.5 shrink-0', mode !== 'now' && 'text-info')} aria-hidden="true" />
        )}
        <span>
          {unresolved
            ? mode === 'at'
              ? '请选择未来的执行时间'
              : '延时至少为 1 分钟'
            : expired
              ? '执行时间必须晚于当前时间'
              : mode === 'now'
                ? '保存并运行后立即排队执行'
                : summary.pending
                  ? `${summary.absolute} · ${summary.relative}`
                  : '请选择执行计划'}
        </span>
      </div>
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
