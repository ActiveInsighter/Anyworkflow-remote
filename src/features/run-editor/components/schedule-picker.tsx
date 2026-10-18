import { Clock, TriangleAlert } from 'lucide-react'
import { SegmentedControl } from '@/components/form/segmented-control'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { formatUtcOffset, type DailyRecurrence } from '@/lib/domain/recurrence'
import {
  describeSchedule,
  fromLocalInputValue,
  minimumScheduleTime,
  toLocalInputValue,
  type DelayUnit,
  type ScheduleMode,
} from '@/lib/domain/schedule'
import { cn } from '@/lib/utils'

const MODE_OPTIONS: ReadonlyArray<{ value: ScheduleMode; label: string }> = [
  { value: 'now', label: '立即' },
  { value: 'at', label: '定时' },
  { value: 'after', label: '延时' },
  { value: 'daily', label: '每天' },
]

export const DELAY_UNITS: ReadonlyArray<{ value: DelayUnit; label: string }> = [
  { value: 'minute', label: '分钟' },
  { value: 'hour', label: '小时' },
  { value: 'day', label: '天' },
]

/** Fixed UTC offsets from −12:00 to +14:00 in 15-minute steps. */
const UTC_OFFSETS = Array.from({ length: 105 }, (_, index) => -720 + index * 15)

function scheduleHint(mode: ScheduleMode, unresolved: boolean, expired: boolean, summary: ReturnType<typeof describeSchedule>) {
  if (unresolved) return mode === 'daily' ? '请选择每天执行时间' : mode === 'at' ? '请选择未来的执行时间' : '延时至少为 1 分钟'
  if (expired) return '执行时间必须晚于当前时间'
  if (mode === 'now') return '保存并运行后立即排队执行'
  if (summary.pending) return `${mode === 'daily' ? '首次：' : ''}${summary.absolute} · ${summary.relative}`
  return '请选择执行计划'
}

/**
 * Run-level execution time. `aw_dispatch_runs.scheduledAt` stores one absolute instant; the
 * controls below only provide different ways to produce that instant.
 */
export function SchedulePicker({
  mode,
  recurrence,
  onRecurrenceChange,
  value,
  onModeChange,
  onValueChange,
  delayAmount,
  delayUnit,
  onDelayAmountChange,
  onDelayUnitChange,
  now,
}: {
  mode: ScheduleMode
  recurrence: DailyRecurrence
  onRecurrenceChange: (rule: DailyRecurrence) => void
  value: string
  onModeChange: (mode: ScheduleMode) => void
  onValueChange: (value: string) => void
  delayAmount: string
  delayUnit: DelayUnit
  onDelayAmountChange: (value: string) => void
  onDelayUnitChange: (unit: DelayUnit) => void
  now: number
}) {
  const clock = new Date(now)
  const summary = describeSchedule(value, clock)
  const unresolved = mode !== 'now' && !value
  const expired = mode !== 'now' && Boolean(value) && !summary.pending
  const invalid = unresolved || expired

  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldTitle>执行方式</FieldTitle>
        <SegmentedControl label="执行方式" value={mode} onValueChange={onModeChange} options={MODE_OPTIONS} className="h-10" />
      </Field>

      {mode === 'at' ? (
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="run-scheduled-at">执行时间</FieldLabel>
          <Input
            id="run-scheduled-at"
            type="datetime-local"
            aria-invalid={invalid || undefined}
            min={toLocalInputValue(minimumScheduleTime(clock))}
            value={toLocalInputValue(value)}
            onChange={(event) => onValueChange(fromLocalInputValue(event.target.value))}
          />
        </Field>
      ) : null}

      {mode === 'daily' ? (
        <>
          <Field data-invalid={invalid || undefined}>
            <FieldLabel htmlFor="run-daily-time">每天执行时间</FieldLabel>
            <Input
              id="run-daily-time"
              type="time"
              required
              aria-invalid={invalid || undefined}
              value={recurrence.time}
              onChange={(event) => onRecurrenceChange({ ...recurrence, time: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="run-daily-zone">时区（固定 UTC 偏移）</FieldLabel>
            <NativeSelect
              id="run-daily-zone"
              value={recurrence.utcOffsetMinutes}
              onChange={(event) => onRecurrenceChange({ ...recurrence, utcOffsetMinutes: Number(event.target.value) })}
            >
              {UTC_OFFSETS.map((offset) => (
                <NativeSelectOption key={offset} value={offset}>
                  {formatUtcOffset(offset)}
                  {offset === 480 ? ' · 北京时间' : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>前一次尚未结束时跳过本次。暂停计划不影响已提交的 Run。</FieldDescription>
          </Field>
        </>
      ) : null}

      {mode === 'after' ? (
        <Field data-invalid={invalid || undefined}>
          <FieldTitle>延时时长</FieldTitle>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-label="延时时长"
              aria-invalid={invalid || undefined}
              value={delayAmount}
              onChange={(event) => onDelayAmountChange(event.target.value)}
            />
            <NativeSelect
              aria-label="延时单位"
              value={delayUnit}
              onChange={(event) => onDelayUnitChange(event.target.value as DelayUnit)}
            >
              {DELAY_UNITS.map((unit) => (
                <NativeSelectOption key={unit.value} value={unit.value}>
                  {unit.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </Field>
      ) : null}

      <div
        role={invalid ? 'alert' : 'status'}
        className={cn(
          'flex min-h-11 items-start gap-2 rounded-md border px-3 py-2.5 text-xs leading-5',
          invalid ? 'border-warning/30 bg-warning-soft text-warning' : 'bg-muted/35 text-muted-foreground',
        )}
      >
        {invalid ? (
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Clock className={cn('mt-0.5 size-3.5 shrink-0', mode !== 'now' && 'text-info')} aria-hidden="true" />
        )}
        <span>{scheduleHint(mode, unresolved, expired, summary)}</span>
      </div>
    </FieldGroup>
  )
}
