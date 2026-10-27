import type { TaskKind } from '@shared/task-kit/index.mjs'
import { listOwnedCollection, quoteFilter } from './client'
import { requireSession } from './session'

/** PocketBase datetime filter literal (`YYYY-MM-DD HH:MM:SS.sssZ`). */
function pocketBaseTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ')
}

/**
 * The owner's live and recently settled records of one task kind, newest change first. Every kind
 * answers the same query (active statuses from the shared catalog, or updated since `since`), which
 * is what lets the task center follow conversions, exports and Runs through one code path.
 */
export async function listTaskFeed<T extends { owner: string; status: string }>(
  kind: TaskKind,
  { since, limit = 8 }: { since: number; limit?: number },
  signal?: AbortSignal,
): Promise<T[]> {
  const owner = quoteFilter(requireSession().record.id)
  const active = kind.statusesIn('queued', 'running').map((status) => `status="${status}"`).join(' || ')
  const settled = kind.statusesIn('succeeded', 'partial', 'failed', 'canceled').map((status) => `status="${status}"`).join(' || ')
  const response = await listOwnedCollection<T>(
    kind.collection,
    {
      page: 1,
      perPage: limit,
      sort: '-updated,-id',
      skipTotal: true,
      filter: `owner="${owner}" && ((${active}) || ((${settled}) && updated>="${pocketBaseTime(since)}"))`,
    },
    (row) => row,
    signal,
  )
  return response.items
}
