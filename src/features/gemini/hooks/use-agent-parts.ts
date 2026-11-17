import { useRef } from 'react'
import { useAsyncData } from '@/hooks/use-async-data'
import { getAgentParts } from '@/lib/api/gemini'
import type { AgentPart, AgentPartsPage } from '@/types/gemini'

/** Cache only the selected segment; an aborted request cannot advance its cursor. */
export function useAgentParts(jobId: string, messageId: string, enabled: boolean, status: string) {
  const state = useRef({ key: '', cursor: 0, parts: new Map<string, AgentPart>() })
  const key = `${jobId}:${messageId}`
  const result = useAsyncData(async signal => {
    const cache = state.current.key === key ? state.current : { key, cursor: 0, parts: new Map<string, AgentPart>() }
    const page = await getAgentParts(jobId, messageId, cache.cursor, signal)
    signal.throwIfAborted()
    for (const part of page.items) {
      const previous = cache.parts.get(part.key)
      if (!previous || previous.revision < part.revision) cache.parts.set(part.key, part)
    }
    cache.cursor = page.nextCursor
    state.current = cache
    return { ...page, key, items: [...cache.parts.values()].sort((a, b) => a.sequence - b.sequence) }
  }, [key, status], {
    enabled,
    pollMs: (data: AgentPartsPage | null) => data?.hasMore ? 100 : data && !['queued', 'running'].includes(data.status) ? 15000 : 3000,
  })
  return { ...result, data: result.data?.key === key ? result.data : null }
}
