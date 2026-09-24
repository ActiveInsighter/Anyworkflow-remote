import type { DispatchEventRecord, WorkflowHistoryEventRecord } from '../types'

/**
 * Prefer the exact dispatch Event index. Some local executors persist one
 * history Event per local run and number that row from zero, so a sole
 * candidate is a safe fallback when its index differs. Never guess when a
 * local run has multiple candidate Events.
 */
export function selectHistoryEventsForDispatchEvent(
  historyEvents: readonly WorkflowHistoryEventRecord[],
  dispatchEvent: Pick<DispatchEventRecord, 'eventIndex'>,
): WorkflowHistoryEventRecord[] {
  const exactMatches = historyEvents.filter((historyEvent) => historyEvent.eventIndex === dispatchEvent.eventIndex)
  if (exactMatches.length) return exactMatches
  return historyEvents.length === 1 ? [historyEvents[0]] : []
}
