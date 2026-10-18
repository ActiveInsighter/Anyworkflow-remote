import { deriveEventProgress } from '@/lib/domain/event-structure'
import { historyStatusCompleted } from '@/lib/domain/run-status'
import { eventProgressLabel } from '@/lib/format'
import type { DispatchEventRecord, WorkflowHistoryActRecord } from '@/types'

export function eventTitle(event: DispatchEventRecord): string {
  return event.queueTextOverride.match(/^\s*@event\s*=\s*(.*?)\s*$/imu)?.[1]?.trim() || `Event ${event.eventIndex + 1}`
}

/**
 * Event progress line. Persisted history Acts win; otherwise fall back to the Acts declared in
 * the queue text, then to whatever the executor last reported.
 */
export function eventProgressSummary(
  event: DispatchEventRecord,
  historyActs: readonly WorkflowHistoryActRecord[] | null,
): string {
  if (historyActs?.length) {
    const total = historyActs.length
    const completed =
      event.terminalResult === 'succeeded' ? total : historyActs.filter((act) => historyStatusCompleted(act.status)).length
    return `${completed} / ${total} Acts`
  }
  const fallback = deriveEventProgress(event.queueTextOverride, event.progress, event.terminalResult)
  if (fallback.totalActs) return `${fallback.completedActs} / ${fallback.totalActs} Acts`
  return eventProgressLabel(event.status, event.progress)
}

