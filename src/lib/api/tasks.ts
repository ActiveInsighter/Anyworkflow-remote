import type { DispatchEventRecord, DispatchTaskRecord } from '../../types'
import { assertOwner, listOwnedCollection, request, quoteFilter } from './client'
import { DEFAULT_PAGE_SIZE, EVENT_COLLECTION, TASK_COLLECTION } from './config'
import { normalizeEvent, normalizeTask } from './normalize'

export async function listTasksForRun(runId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listOwnedCollection<DispatchTaskRecord>(TASK_COLLECTION, {
    page,
    perPage,
    sort: '+runIndex',
    filter: `run="${quoteFilter(runId)}"`,
  }, normalizeTask)
}

export async function getTask(id: string): Promise<DispatchTaskRecord> {
  return normalizeTask(assertOwner(await request<DispatchTaskRecord>(`/api/collections/${TASK_COLLECTION}/records/${encodeURIComponent(id)}`)))
}

export async function listEventsForTask(taskId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listOwnedCollection<DispatchEventRecord>(EVENT_COLLECTION, {
    page,
    perPage,
    sort: '+eventIndex',
    filter: `task="${quoteFilter(taskId)}"`,
  }, normalizeEvent)
}

export async function getEvent(id: string): Promise<DispatchEventRecord> {
  return normalizeEvent(assertOwner(await request<DispatchEventRecord>(`/api/collections/${EVENT_COLLECTION}/records/${encodeURIComponent(id)}`)))
}
