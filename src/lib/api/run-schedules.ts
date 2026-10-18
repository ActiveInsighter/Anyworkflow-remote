import { assertOwner, listOwnedCollection, request } from './client'
import { RUN_SCHEDULE_COLLECTION } from './config'
import { normalizeRecurrence, type DailyRecurrence } from '../domain/recurrence'
import type { PocketBaseListResponse } from '../../types'
export interface RunSchedule {
  id: string
  owner: string
  sourceRun: string
  title: string
  rule: DailyRecurrence
  enabled: boolean
  revision: number
  nextRunAt: string
  lastRun: string
  skippedCount: number
  lastSkippedAt: string
  lastError: string
}
function normalizeSchedule(record: RunSchedule): RunSchedule {
  assertOwner(record)
  if (typeof record.enabled !== 'boolean' || !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      typeof record.nextRunAt !== 'string' || !Number.isFinite(Date.parse(record.nextRunAt))) throw new Error('重复计划响应无效')
  return { ...record, rule: normalizeRecurrence(record.rule) }
}
export function listRunSchedules(page: number, signal?: AbortSignal): Promise<PocketBaseListResponse<RunSchedule>> {
  return listOwnedCollection(RUN_SCHEDULE_COLLECTION, { page, perPage: 20, sort: '-created' }, normalizeSchedule, signal)
}
export async function setRunScheduleEnabled(schedule: RunSchedule, enabled: boolean): Promise<RunSchedule> {
  assertOwner(schedule)
  return normalizeSchedule(await request<RunSchedule>(`/api/anyworkflow/run-schedules/${encodeURIComponent(schedule.id)}/state`, {
    method: 'PUT', data: { enabled, expectedRevision: schedule.revision },
  }))
}
export async function deleteRunSchedule(schedule: RunSchedule): Promise<void> {
  assertOwner(schedule)
  await request(`/api/collections/${RUN_SCHEDULE_COLLECTION}/records/${encodeURIComponent(schedule.id)}`, { method: 'DELETE' })
}
