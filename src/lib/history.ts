import type { DispatchEventRecord, WorkflowHistoryEventRecord } from '../types'

/**
 * A dispatch Event maps to the history Event with the same event index.
 * Keep this selection explicit so a multi-event local run cannot display the
 * acts belonging to its sibling events.
 */
export function selectHistoryEventsForDispatchEvent(
  historyEvents: readonly WorkflowHistoryEventRecord[],
  dispatchEvent: Pick<DispatchEventRecord, 'eventIndex'>,
): WorkflowHistoryEventRecord[] {
  return historyEvents.filter((historyEvent) => historyEvent.eventIndex === dispatchEvent.eventIndex)
}
