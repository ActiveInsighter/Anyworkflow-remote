import { invalidateAsyncDataCache } from '@/hooks/use-async-data'
import type { RunListFilter } from '@/lib/api'
import { notifyTasksChanged } from '@/lib/tasks'

/**
 * Cache keys for Run data in `useAsyncData`. Every reader and every mutation goes through these
 * builders, so an invalidation can never miss a key spelled slightly differently elsewhere.
 */
export const runKeys = {
  list: (ownerId: string, filter: RunListFilter, page: number, query: string) =>
    `runs:${ownerId}:${filter}:${page}:${JSON.stringify(query)}`,
  detail: (runId: string) => `run:${runId}`,
  tasks: (runId: string, page: number) => `tasks:${runId}:${page}`,
  family: (familyId: string) => `run-family:${familyId}`,
  events: (taskId: string, page: number) => `events:${taskId}:${page}`,
  historyActs: (eventId: string, localRunId: string, attempt: number) => `history-acts:${eventId}:${localRunId}:${attempt}`,
  historyMessages: (actId: string, attempt: number, page: number) => `history-messages:${actId}:${attempt}:${page}`,
}

/**
 * Drop cached Run data after a mutation. Each flag names one family of keys. Every Run mutation
 * passes through here, so it also tells the task center to refresh.
 */
export function invalidateRuns(scope: { lists?: boolean; runId?: string; tasksOf?: string; familyId?: string }) {
  notifyTasksChanged()
  if (scope.lists) invalidateAsyncDataCache('runs:')
  if (scope.runId) invalidateAsyncDataCache(runKeys.detail(scope.runId))
  if (scope.tasksOf) invalidateAsyncDataCache(`tasks:${scope.tasksOf}:`)
  if (scope.familyId) invalidateAsyncDataCache(runKeys.family(scope.familyId))
}
