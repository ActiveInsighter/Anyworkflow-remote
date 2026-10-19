import { useAsyncData } from '@/hooks/use-async-data'
import { listHistoryMessageSummariesForAct, toErrorMessage } from '@/lib/api'
import type { WorkflowHistoryActRecord } from '@/types'
import { RUN_HIERARCHY_PAGE_SIZE } from '../lib/constants'
import { runKeys } from '../lib/query-keys'

/** One page of message summaries for an open Act. Bodies load separately, when a message opens. */
export function useActMessages(act: WorkflowHistoryActRecord, page: number, open: boolean, pollMs: number) {
  return useAsyncData(
    (signal) => listHistoryMessageSummariesForAct(act.id, page, RUN_HIERARCHY_PAGE_SIZE, signal),
    [act.id, act.attempt, page],
    {
      enabled: open,
      pollMs: open ? pollMs : undefined,
      cacheKey: runKeys.historyMessages(act.id, act.attempt, page),
      errorMessage: toErrorMessage,
    },
  )
}
