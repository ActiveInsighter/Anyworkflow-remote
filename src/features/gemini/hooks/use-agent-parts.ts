import { useRef } from 'react'
import { useAsyncData } from '@/hooks/use-async-data'
import { getAgentParts } from '@/lib/api/gemini'
import type { AgentPart, AgentPartsPage } from '@/types/gemini'

/** Cache only the selected segment; an aborted request cannot advance its cursor. */
export function useAgentParts(jobId: string, messageId: string, enabled: boolean, status: string) {
  const state = useRef({ key: '', cursor: 0, parts: new Map<string, AgentPart>() })
  const key = `${jobId}:${messageId}`
  const result = useAsyncData(async signal => {
    const previous = state.current.key === key ? state.current : null
    // Commit the cursor and merged map together only after the entire drain.
    // A failed/aborted later page cannot discard already displayed history.
    const cache = { key, cursor: previous?.cursor ?? 0, parts: new Map(previous?.parts) }
    let page: AgentPartsPage
    do {
      page = await getAgentParts(jobId, messageId, cache.cursor, signal)
      signal.throwIfAborted()
      for (const part of page.items) {
        const existing = cache.parts.get(part.key)
        if (!existing || existing.revision < part.revision) cache.parts.set(part.key, part)
      }
      cache.cursor = page.nextCursor
    } while (page.hasMore)
    state.current = cache
    return { ...page, key, items: [...cache.parts.values()].sort((a, b) => a.sequence - b.sequence) }
  }, [key, status], {
    enabled,
    pollMs: (data: AgentPartsPage | null) => data && !['queued', 'running'].includes(data.status) ? 15000 : 3000,
  })
  return { ...result, data: result.data?.key === key ? result.data : null }
}
