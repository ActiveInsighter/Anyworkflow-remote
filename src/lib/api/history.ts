import type { DispatchEventRecord, WorkflowHistoryActRecord, WorkflowHistoryEventRecord, WorkflowHistoryMessageRecord, WorkflowHistoryMessageSummary } from '../../types'
import { selectHistoryEventsForDispatchEvent } from '../domain/history-selection'
import { ApiError, assertOwner, collectPages, listOwnedCollection, request, quoteFilter } from './client'
import { DEFAULT_PAGE_SIZE, HISTORY_ACT_COLLECTION, HISTORY_EVENT_COLLECTION, HISTORY_MESSAGE_COLLECTION } from './config'

/**
 * Dispatch keeps the local executor run id on an Event. The history writer uses
 * that same value as aw_tasks.taskId, so the relation chain can be traversed
 * without adding a second foreign key to the dispatch collections.
 */
export async function listHistoryEventsForLocalRun(
  localRunId: string,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
  eventIndex?: number,
  signal?: AbortSignal,
) {
  const eventIndexFilter = Number.isSafeInteger(eventIndex) ? ` && eventIndex = ${eventIndex}` : ''
  return listOwnedCollection<WorkflowHistoryEventRecord>(HISTORY_EVENT_COLLECTION, {
    page,
    perPage,
    sort: '+eventIndex',
    filter: `task.taskId="${quoteFilter(localRunId)}"${eventIndexFilter}`,
  }, (record) => record, signal)
}

export async function listAllHistoryEventsForLocalRun(
  localRunId: string,
  eventIndex?: number,
  signal?: AbortSignal,
): Promise<WorkflowHistoryEventRecord[]> {
  const first = await listHistoryEventsForLocalRun(localRunId, 1, DEFAULT_PAGE_SIZE, eventIndex, signal)
  return collectPages(first, (page) => listHistoryEventsForLocalRun(localRunId, page, first.perPage, eventIndex, signal))
}

export async function listHistoryActsForEvent(historyEventId: string, page = 1, perPage = DEFAULT_PAGE_SIZE, signal?: AbortSignal) {
  return listOwnedCollection<WorkflowHistoryActRecord>(HISTORY_ACT_COLLECTION, {
    page,
    perPage,
    sort: '+actIndex',
    filter: `event="${quoteFilter(historyEventId)}"`,
  }, (record) => record, signal)
}

export async function listAllHistoryActsForEvent(historyEventId: string, signal?: AbortSignal): Promise<WorkflowHistoryActRecord[]> {
  const first = await listHistoryActsForEvent(historyEventId, 1, DEFAULT_PAGE_SIZE, signal)
  return collectPages(first, (page) => listHistoryActsForEvent(historyEventId, page, first.perPage, signal))
}

async function historyEventsForDispatchEvent(
  event: DispatchEventRecord,
  signal?: AbortSignal,
): Promise<WorkflowHistoryEventRecord[]> {
  if (!event.localRunId) return []
  let candidates = await listAllHistoryEventsForLocalRun(event.localRunId, event.eventIndex, signal)
  if (!candidates.length) candidates = await listAllHistoryEventsForLocalRun(event.localRunId, undefined, signal)
  return selectHistoryEventsForDispatchEvent(candidates, event)
}

export async function listHistoryActsForDispatchEvent(event: DispatchEventRecord, signal?: AbortSignal): Promise<WorkflowHistoryActRecord[]> {
  const historyEvents = await historyEventsForDispatchEvent(event, signal)
  const acts = (await Promise.all(historyEvents.map((historyEvent) => listAllHistoryActsForEvent(historyEvent.id, signal)))).flat()
  return acts.sort((left, right) => left.actIndex - right.actIndex || left.id.localeCompare(right.id))
}

/** Render only persisted records. Counts on Acts can describe the planned queue. */
export async function listHistoryMessageSummariesForAct(actId: string, page = 1, perPage = DEFAULT_PAGE_SIZE, signal?: AbortSignal) {
  return listOwnedCollection<WorkflowHistoryMessageSummary>(HISTORY_MESSAGE_COLLECTION, {
    page,
    perPage,
    sort: '+nodeIndex,+id',
    filter: `act="${quoteFilter(actId)}"`,
    fields: 'id,owner,act,nodeIndex,attempt,status,sentAt,receivedAt,created,updated',
  }, (record) => record, signal)
}

/** Record identity is independent of sparse/global queue indexes and attempts. */
export async function getHistoryMessage(id: string, actId: string, signal?: AbortSignal): Promise<WorkflowHistoryMessageRecord> {
  const message = assertOwner(await request<WorkflowHistoryMessageRecord>(
    `/api/collections/${HISTORY_MESSAGE_COLLECTION}/records/${encodeURIComponent(id)}`, { signal },
  ))
  if (message.act !== actId) throw new ApiError('消息不属于当前 Act', 502, 'INVALID_MESSAGE_ACT')
  return message
}

export async function listHistoryMessagesForAct(actId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listOwnedCollection<WorkflowHistoryMessageRecord>(HISTORY_MESSAGE_COLLECTION, {
    page,
    perPage,
    sort: '+nodeIndex',
    filter: `act="${quoteFilter(actId)}"`,
  }, (record) => record)
}

/** Loads one message record only after the user opens its details. */
export async function getHistoryMessageForAct(
  actId: string,
  nodeIndex: number | null,
  signal?: AbortSignal,
): Promise<WorkflowHistoryMessageRecord | null> {
  if (!actId.trim()) throw new ApiError('Act 标识无效', 400, 'HISTORY_ACT_REQUIRED')
  if (nodeIndex !== null && (!Number.isSafeInteger(nodeIndex) || nodeIndex < 0)) {
    throw new ApiError('消息序号无效', 400, 'HISTORY_MESSAGE_INDEX_INVALID')
  }

  const result = await listOwnedCollection<WorkflowHistoryMessageRecord>(HISTORY_MESSAGE_COLLECTION, {
    page: 1,
    perPage: 1,
    sort: '+nodeIndex',
    filter: `act="${quoteFilter(actId)}"${nodeIndex === null ? '' : ` && nodeIndex=${nodeIndex}`}`,
  }, (record) => record, signal)
  return result.items[0] ?? null
}

/** Resolve a planned/fallback Act to persisted history only when its message is opened. */
export async function getHistoryMessageForDispatchEvent(
  event: DispatchEventRecord,
  actIndex: number,
  nodeIndex: number | null,
  signal?: AbortSignal,
): Promise<WorkflowHistoryMessageRecord | null> {
  if (!event.localRunId || !Number.isSafeInteger(actIndex) || actIndex < 0) return null
  const historyEvents = await historyEventsForDispatchEvent(event, signal)
  if (!historyEvents.length) return null

  const historyActs = (await Promise.all(historyEvents.map((historyEvent) =>
    listAllHistoryActsForEvent(historyEvent.id, signal),
  ))).flat()
  const historyAct = historyActs.find((act) => act.actIndex === actIndex)
  if (!historyAct) return null
  return getHistoryMessageForAct(historyAct.id, nodeIndex, signal)
}

export async function listAllHistoryMessagesForAct(actId: string): Promise<WorkflowHistoryMessageRecord[]> {
  const first = await listHistoryMessagesForAct(actId)
  return collectPages(first, (page) => listHistoryMessagesForAct(actId, page, first.perPage))
}
