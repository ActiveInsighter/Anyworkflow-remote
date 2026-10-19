import { useAsyncData } from '@/hooks/use-async-data'
import { listHistoryActsForDispatchEvent, toErrorMessage } from '@/lib/api'
import type { DispatchEventRecord } from '@/types'
import { POLL_MS } from '../lib/constants'
import { executionPollMs } from '../lib/polling'
import { runKeys } from '../lib/query-keys'

/**
 * Persisted Acts of one dispatch Event. Loads only while the Event is open and has a local run
 * to read history from; before that there is nothing to show, and nothing is invented.
 */
export function useEventActs(event: DispatchEventRecord, open: boolean) {
  const enabled = open && Boolean(event.localRunId)
  return useAsyncData(
    (signal) => listHistoryActsForDispatchEvent(event, signal),
    [event.id, event.localRunId, event.attempt, event.eventIndex],
    {
      enabled,
      pollMs: enabled ? executionPollMs({ terminal: event.status === 'terminal', updated: event.updated }) : undefined,
      staleMs: POLL_MS.runDetail,
      cacheKey: enabled ? runKeys.historyActs(event.id, event.localRunId ?? '', event.attempt) : undefined,
      errorMessage: toErrorMessage,
    },
  )
}
