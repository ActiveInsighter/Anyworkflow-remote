export interface DailyRecurrence {
  frequency: 'daily'
  time: string
  /** Fixed UTC offset; the UI explicitly names the offset instead of a DST-observing zone. */
  utcOffsetMinutes: number
}
export function normalizeRecurrence(value: unknown): DailyRecurrence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('每天重复的时间或时区无效')
  const rule = value as Record<string, unknown>
  if (Object.keys(rule).length !== 3 || rule.frequency !== 'daily' || typeof rule.time !== 'string' ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.time) || typeof rule.utcOffsetMinutes !== 'number' ||
      !Number.isSafeInteger(rule.utcOffsetMinutes) || rule.utcOffsetMinutes < -720 || rule.utcOffsetMinutes > 840 ||
      rule.utcOffsetMinutes % 15 !== 0) throw new Error('每天重复的时间或时区无效')
  return { frequency: 'daily', time: rule.time, utcOffsetMinutes: rule.utcOffsetMinutes }
}
export function nextDailyInstant(value: DailyRecurrence, now = Date.now()): string {
  const rule = normalizeRecurrence(value)
  const offset = rule.utcOffsetMinutes * 60000
  const shifted = new Date(now + offset)
  const [hour, minute] = rule.time.split(':').map(Number)
  let target = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hour, minute) - offset
  if (target <= now) target += 86400_000
  return new Date(target).toISOString()
}
export function formatUtcOffset(minutes: number): string {
  const absolute = Math.abs(minutes)
  return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}
export function defaultDailyRecurrence(): DailyRecurrence {
  return { frequency: 'daily', time: '09:00', utcOffsetMinutes: -new Date().getTimezoneOffset() }
}
