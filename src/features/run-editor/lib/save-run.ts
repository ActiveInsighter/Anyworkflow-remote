import { createEditedRun, createRun, updateRunDraft } from '@/lib/api'
import type { DailyRecurrence } from '@/lib/domain/recurrence'
import type { RuntimeConfig } from '@/lib/domain/runtime-config'
import type { DispatchRunRecord } from '@/types'

/**
 * Writes the editor's source. A draft Run is updated in place; a finished Run is never mutated
 * and forks an `edited_rerun` version instead; with no source Run, a new Run is created.
 */
export function saveRunSource({
  sourceRun,
  planText,
  publish,
  scheduledAt,
  runtimeConfig,
  recurrence,
}: {
  sourceRun: DispatchRunRecord | null
  planText: string
  publish: boolean
  scheduledAt: string
  runtimeConfig: RuntimeConfig | null
  recurrence: DailyRecurrence | null
}): Promise<DispatchRunRecord> {
  const status = publish ? 'queued' : 'draft'
  if (!sourceRun) return createRun(planText, status, scheduledAt, null, runtimeConfig, recurrence)
  if (sourceRun.status === 'draft') {
    return updateRunDraft(sourceRun.id, planText, { publish, scheduledAt, runtimeConfig, recurrence })
  }
  return createEditedRun(sourceRun.id, planText, status, scheduledAt, runtimeConfig, recurrence)
}
