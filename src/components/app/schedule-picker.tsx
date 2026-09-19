import { CalendarClock, Clock, TriangleAlert } from 'lucide-react'
import { Segmented, TextInput } from '@/components/app/ui'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  describeSchedule,
  fromLocalInputValue,
  minimumScheduleTime,
  resolveDelay,
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
  compact = false,
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
  compact?: boolean
}) {
  const clock = new Date(now)
  const summary = describeSchedule(value, clock)
  const unresolved = mode !== 'now' && !value
  const expired = mode !== 'now' && Boolean(value) && !summary.pending
  const invalid = unresolved || expired
  const minimum = toLocalInputValue(minimumScheduleTime(clock))

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented
          label="执行时间"
          value={mode}
          onChange={onModeChange}
          options={MODE_OPTIONS}
          className="w-full shrink-0 sm:w-[210px]"
        />

        {mode === 'at' ? (
          <TextInput
            type="datetime-local"
            aria-label="执行时刻"
            aria-invalid={invalid || undefined}
            min={minimum}
            value={toLocalInputValue(value)}
            onChange={(event) => onValueChange(fromLocalInputValue(event.target.value))}
            className={cn('w-full sm:w-[210px]', invalid && 'border-danger focus-visible:border-danger')}
          />
        ) : null}

        {mode === 'after' ? (
          <div className="grid w-full grid-cols-[minmax(0,1fr)_104px] gap-2 sm:w-[250px] sm:grid-cols-[110px_104px]">
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-label="延时时长"
              aria-invalid={invalid || undefined}
              value={delayAmount}
              onChange={(event) => onDelayAmountChange(event.target.value)}
              className={cn(invalid && 'border-danger focus-visible:border-danger')}
            />
            <Select
              aria-label="延时单位"
              value={delayUnit}
              onChange={(event) => onDelayUnitChange(event.target.value as DelayUnit)}
            >
              {DELAY_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      {invalid ? (
        <p className="flex items-center gap-1.5 text-[11px] leading-4 text-warning">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{unresolved ? (mode === 'at' ? '请选择未来的执行时间' : '延时至少为 1 分钟') : '执行时间必须晚于当前时间'}</span>
        </p>
      ) : compact ? null : mode === 'now' ? (
        <p className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          <span>保存并运行后立即排队执行</span>
        </p>
      ) : summary.pending ? (
        <p className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
          <Clock className="size-3.5 shrink-0 text-info" aria-hidden="true" />
          <span>
            将于 <span className="text-info">{summary.absolute}</span> 执行 · {summary.relative}
          </span>
        </p>
      ) : null}
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
