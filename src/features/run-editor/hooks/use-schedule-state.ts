import { useState } from 'react'
import { defaultDailyRecurrence, nextDailyInstant, normalizeRecurrence, type DailyRecurrence } from '@/lib/domain/recurrence'
import {
  defaultScheduleTime,
  isFutureScheduledAt,
  resolveDelay,
  toScheduledAt,
  type DelayUnit,
  type ScheduleMode,
} from '@/lib/domain/schedule'
import { DELAY_UNITS } from '../components/schedule-picker'

/**
 * Editor-side schedule state. Every mode resolves to one `scheduledAt` instant (or a daily rule
 * whose next instant is derived), which is what the backend stores.
 */
export function useScheduleState({ now, onEdit }: { now: number; onEdit: () => void }) {
  const [recurrence, setRecurrence] = useState<DailyRecurrence>(defaultDailyRecurrence)
  const [mode, setMode] = useState<ScheduleMode>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [delayAmount, setDelayAmount] = useState('1')
  const [delayUnit, setDelayUnit] = useState<DelayUnit>('hour')

  const dailyTime = (rule: DailyRecurrence) => {
    try {
      return nextDailyInstant(rule, now)
    } catch {
      return ''
    }
  }

  let recurrenceInvalid = false
  try {
    if (mode === 'daily') normalizeRecurrence(recurrence)
  } catch {
    recurrenceInvalid = true
  }
  const invalid =
    mode === 'daily'
      ? recurrenceInvalid
      : mode !== 'now' && (!scheduledAt || !isFutureScheduledAt(scheduledAt, new Date(now)))

  /** Load persisted timing. `recompute` derives the instant from the rule instead of trusting it. */
  function load(next: { scheduledAt: string; recurrence: DailyRecurrence | null | undefined; recompute?: boolean }) {
    setScheduledAt(next.recurrence && next.recompute ? dailyTime(next.recurrence) : next.scheduledAt)
    if (next.recurrence) setRecurrence(next.recurrence)
    setMode(next.recurrence ? 'daily' : next.scheduledAt ? 'at' : 'now')
  }

  function changeMode(next: ScheduleMode) {
    setMode(next)
    if (next === 'now') {
      setScheduledAt('')
    } else if (next === 'daily') {
      setScheduledAt(dailyTime(recurrence))
    } else if (next === 'at') {
      setScheduledAt(toScheduledAt(defaultScheduleTime(new Date(now))))
    } else {
      const amount = Number(delayAmount)
      const safeAmount = Number.isSafeInteger(amount) && amount >= 1 ? amount : 1
      if (safeAmount !== amount) setDelayAmount(String(safeAmount))
      setScheduledAt(toScheduledAt(resolveDelay(safeAmount, delayUnit, new Date(now))))
    }
    onEdit()
  }

  function changeValue(value: string) {
    setScheduledAt(value)
    onEdit()
  }

  function changeDelay(amountText: string, unit: DelayUnit = delayUnit) {
    setDelayAmount(amountText)
    setDelayUnit(unit)
    const amount = Number(amountText)
    setScheduledAt(
      Number.isSafeInteger(amount) && amount >= 1 ? toScheduledAt(resolveDelay(amount, unit, new Date(now))) : '',
    )
    onEdit()
  }

  function changeRecurrence(next: DailyRecurrence) {
    setRecurrence(next)
    setScheduledAt(dailyTime(next))
    onEdit()
  }

  const unitLabel = DELAY_UNITS.find((unit) => unit.value === delayUnit)?.label ?? ''
  const label =
    mode === 'daily'
      ? `每天 ${recurrence.time}`
      : mode === 'now'
        ? '立即'
        : mode === 'at'
          ? '定时'
          : `${delayAmount || 1}${unitLabel}后`

  return {
    mode,
    scheduledAt,
    recurrence,
    /** The rule to persist, or null when not repeating. */
    activeRecurrence: mode === 'daily' ? recurrence : null,
    delayAmount,
    delayUnit,
    invalid,
    /** Instant shown in the picker: the next daily occurrence, or the chosen instant. */
    pickerValue: mode === 'daily' && !recurrenceInvalid ? nextDailyInstant(recurrence, now) : scheduledAt,
    label,
    load,
    changeMode,
    changeValue,
    changeDelay,
    changeRecurrence,
  }
}

export type ScheduleState = ReturnType<typeof useScheduleState>
