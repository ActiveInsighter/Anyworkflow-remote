import { formatDateTime } from '@/lib/format'

/**
 * `aw_dispatch_runs.scheduledAt` is a one-shot not-before boundary, not a cron expression.
 * The PocketBase hook validates the persisted value against this exact shape, so mirroring it
 * here lets the UI reject a bad instant before it turns into a 400.
 * See `pocketbase/pb_hooks/aw_dispatch_scheduler.pb.js` in the extension repository.
 */
export const SCHEDULED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u

/** How the user expressed the instant. Both `at` and `after` collapse to the same stored value. */
export type ScheduleMode = 'now' | 'at' | 'after'

export interface DelayPreset {
  id: string
  label: string
  /** Offset from now. */
  minutes?: number
  /** Next occurrence of this local hour — that is what "明早 9 点" means. */
  nextLocalHour?: number
}

export const DELAY_PRESETS: readonly DelayPreset[] = [
  { id: '15m', label: '+15 分', minutes: 15 },
  { id: '1h', label: '+1 小时', minutes: 60 },
  { id: '3h', label: '+3 小时', minutes: 180 },
  { id: 'tomorrow9', label: '明早 9 点', nextLocalHour: 9 },
]

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * The wire format. `toISOString()` always emits a `Z` suffix, which satisfies the
 * "explicit UTC offset" requirement the orchestration contract asks for.
 */
export function toScheduledAt(date: Date): string {
  return date.toISOString()
}

export function isValidScheduledAt(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  return SCHEDULED_AT_PATTERN.test(trimmed) && Number.isFinite(Date.parse(trimmed))
}

export function parseScheduledAt(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const timestamp = Date.parse(trimmed)
  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}

/** `<input type="datetime-local">` speaks local wall-clock time with no offset. */
export function toLocalInputValue(value: string | Date): string {
  const date = value instanceof Date ? value : parseScheduledAt(value)
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * A bare `YYYY-MM-DDTHH:mm` is parsed as local time, which is what the picker collected.
 * Returns `''` when the control was cleared so the caller can keep the field invalid-but-editable.
 */
export function fromLocalInputValue(value: string): string {
  if (!value.trim()) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? toScheduledAt(date) : ''
}

export function resolveDelayPreset(preset: DelayPreset, now = new Date()): Date {
  if (preset.minutes !== undefined) return new Date(now.getTime() + preset.minutes * 60_000)
  const target = new Date(now)
  target.setDate(target.getDate() + 1)
  target.setHours(preset.nextLocalHour ?? 9, 0, 0, 0)
  return target
}

/** One hour out, rounded down to the minute — a sensible starting point for the picker. */
export function defaultScheduleTime(now = new Date()): Date {
  const target = new Date(now.getTime() + 60 * 60_000)
  target.setSeconds(0, 0)
  return target
}

export function formatRelative(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return '已到时'
  const minutes = Math.max(1, Math.round(diff / 60_000))
  if (minutes < 60) return `${minutes} 分钟后`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes ? `${hours} 小时 ${restMinutes} 分后` : `${hours} 小时后`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days} 天 ${restHours} 小时后` : `${days} 天后`
}

export interface ScheduleSummary {
  /** An instant is stored on the Run. */
  set: boolean
  /** That instant has not arrived yet. */
  pending: boolean
  /** `09-19 18:00`, or `—` when nothing is stored. */
  absolute: string
  /** `2 小时 15 分后`, or `立即执行` when nothing is stored. */
  relative: string
}

/**
 * Single source of truth for every schedule readout in the app, so the list badge, the detail
 * panel and the editor hint can never disagree about whether a Run is actually waiting.
 */
export function describeSchedule(scheduledAt: string, now = new Date()): ScheduleSummary {
  const target = parseScheduledAt(scheduledAt)
  if (!target) return { set: false, pending: false, absolute: '—', relative: '立即执行' }
  const diff = target.getTime() - now.getTime()
  return {
    set: true,
    pending: diff > 0,
    absolute: formatDateTime(target.toISOString()),
    relative: formatRelative(target, now),
  }
}
