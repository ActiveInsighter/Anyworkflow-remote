import { useRef } from 'react'
import { useAsyncData } from '@/hooks/use-async-data'
import { getAgentParts } from '@/lib/api/gemini'
import type { AgentPart, AgentPartsPage } from '@/types/gemini'

/** Mounted per segment. Cursor advances only after an entire page is validated. */
export function useAgentParts(jobId: string, messageId: string, enabled: boolean, status: string) {
  const state = useRef({ cursor: 0, parts: new Map<string, AgentPart>() })
  return useAsyncData(async signal => {
    const page = await getAgentParts(jobId, messageId, state.current.cursor, signal)
    signal.throwIfAborted()
    for (const part of page.items) {
      const previous = state.current.parts.get(part.key)
      if (!previous || previous.revision < part.revision) state.current.parts.set(part.key, part)
    }
    state.current.cursor = page.nextCursor
    return { ...page, items: [...state.current.parts.values()].sort((a, b) => a.sequence - b.sequence) }
  }, [jobId, messageId, status], {
    enabled,
    pollMs: (data: AgentPartsPage | null) => data?.hasMore ? 100 : data && !['queued', 'running'].includes(data.status) ? 15000 : 3000,
  })
}
