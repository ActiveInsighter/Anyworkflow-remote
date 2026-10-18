import { useAsyncData } from '@/hooks/use-async-data'
import { listRuns, toErrorMessage, type RunListFilter } from '@/lib/api'
import { useSession } from '@/lib/api/session'
import { POLL_MS, RUN_LIST_PAGE_SIZE } from '../lib/constants'
import { runKeys } from '../lib/query-keys'

/** One page of the owner's Runs. Polls only where active Runs can appear. */
export function useRunList({ filter, page, query }: { filter: RunListFilter; page: number; query: string }) {
  const session = useSession()
  const ownerId = session?.record.id
  return useAsyncData((signal) => listRuns(page, RUN_LIST_PAGE_SIZE, filter, query, signal), [ownerId, page, filter, query], {
    enabled: Boolean(ownerId),
    pollMs: filter === 'active' || filter === 'all' ? POLL_MS.runList : undefined,
    staleMs: 10_000,
    cacheKey: ownerId ? runKeys.list(ownerId, filter, page, query) : undefined,
    errorMessage: toErrorMessage,
  })
}
