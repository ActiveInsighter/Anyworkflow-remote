import { ApiError, assertOwner, listOwnedCollection, quoteFilter, request } from './client'
import { requireSession } from './session'
import type { GeminiInput, GeminiJob, GeminiMessage, GeminiPreview, GeminiJobView } from '@/types/gemini'

const API = '/api/anyworkflow/gemini'
export function previewGemini(input: GeminiInput, signal?: AbortSignal) {
  return request<GeminiPreview>(`${API}/preview`, { method: 'POST', data: input, signal })
}
export async function createGemini(id: string, input: GeminiInput) {
  return assertOwner(
    await request<GeminiJob>(`${API}/jobs`, {
      method: 'POST',
      data: { ...input, id },
      signal: AbortSignal.timeout(60_000),
    }),
  )
}
export function listGeminiJobs(page: number, signal?: AbortSignal) {
  return listOwnedCollection<GeminiJob>(
    'aw_gemini_jobs',
    {
      page,
      perPage: 20,
      sort: '-created,-id',
      filter: `owner="${quoteFilter(requireSession().record.id)}"`,
    },
    (row) => row,
    signal,
  )
}
/** One transaction returns the task and segment states from the same snapshot. */
export async function getGeminiView(id: string, signal?: AbortSignal) {
  const view = await request<GeminiJobView>(`${API}/jobs/${encodeURIComponent(id)}`, { signal })
  if (!view || !Array.isArray(view.messages)) throw new ApiError('消息详情格式无效', 502)
  assertOwner(view.job)
  if (view.job.id !== id || view.messages.some((row) => assertOwner(row).job !== id)) throw new ApiError('分段归属无效', 502)
  return view
}
export async function getGeminiMessage(jobId: string, id: string, signal?: AbortSignal) {
  const message = assertOwner(await request<GeminiMessage>(`${API}/jobs/${encodeURIComponent(jobId)}/messages/${encodeURIComponent(id)}`, { signal }))
  if (message.job !== jobId || message.id !== id) throw new ApiError('分段归属无效', 502)
  return message
}
export function deleteGeminiJob(id: string) {
  return request(`${API}/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
export async function cancelGemini(job: GeminiJob) {
  assertOwner(job)
  return assertOwner(
    await request<GeminiJob>(`${API}/jobs/${encodeURIComponent(job.id)}/cancel`, {
      method: 'POST',
      data: {},
    }),
  )
}

export async function getGeminiConfig(signal?: AbortSignal) {
  return assertOwner(await request<import('@/types/gemini').GeminiConfigRecord>(`${API}/config`, { signal }))
}
export async function saveGeminiConfig(
  config: import('@/types/gemini').GeminiConfig,
  expectedRevision: number,
) {
  return assertOwner(
    await request<import('@/types/gemini').GeminiConfigRecord>(`${API}/config`, {
      method: 'PUT',
      data: { config, expectedRevision },
    }),
  )
}

export type GeminiThreadSummary = Pick<GeminiJob, 'id' | 'owner' | 'title' | 'status' | 'created' | 'updated' | 'parentMessage'> & { archived?: boolean; pinned?: boolean; threadRoot?: string }
export async function listGeminiThreads(signal?: AbortSignal): Promise<GeminiThreadSummary[]> {
  const owner = requireSession().record.id
  const page = (value: number) => listOwnedCollection<GeminiThreadSummary>('aw_gemini_jobs', {
    page: value, perPage: 100, sort: '-created,-id', filter: `owner="${quoteFilter(owner)}"`,
    fields: 'id,owner,title,status,created,updated,parentMessage,archived,threadRoot,pinned',
  }, row => row, signal)
  const first = await page(1)
  const items = [...first.items]
  for (let start = 2; start <= first.totalPages; start += 4) {
    const next = await Promise.all(Array.from({ length: Math.min(4, first.totalPages - start + 1) }, (_, index) => page(start + index)))
    items.push(...next.flatMap(result => result.items))
  }
  return items
}
export async function updateGeminiThread(id: string, metadata: { title?: string; archived?: boolean; pinned?: boolean }) {
  const record = assertOwner(await request<{ id: string; owner: string; title: string; archived: boolean }>(`${API}/jobs/${encodeURIComponent(id)}/metadata`, { method: 'PATCH', data: metadata }))
  if (record.id !== id) throw new ApiError('对话归属无效', 502)
  return record
}

export function deleteGeminiThread(id: string) {
  return request(`${API}/threads/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Read only the owned, persisted parent chain; never infer tool activity from text. */
export async function getGeminiAncestors(job: GeminiJob, catalog: GeminiThreadSummary[], signal?: AbortSignal) {
  const records = new Map(catalog.map(record => [record.id, record]))
  const ancestors: GeminiMessage[] = []
  const visited = new Set<string>()
  let parent = job.parentMessage
  const limit = Math.min(20, Math.floor((job.history?.length ?? 0) / 2))
  while (parent && ancestors.length < limit && !visited.has(parent)) {
    visited.add(parent)
    const message = assertOwner(await request<GeminiMessage>(`/api/collections/aw_gemini_messages/records/${encodeURIComponent(parent)}`, { signal }))
    if (message.id !== parent || !records.has(message.job)) throw new ApiError('上文消息归属无效', 502)
    ancestors.push(message)
    parent = records.get(message.job)?.parentMessage
  }
  return ancestors
}

export async function submitGeminiFeedback(jobId: string, id: string, type: 'positive' | 'negative', comment?: string) {
  const record = assertOwner(await request<{id: string; owner: string; job: string; feedback: string}>(`${API}/jobs/${encodeURIComponent(jobId)}/messages/${encodeURIComponent(id)}/feedback`, {method:'POST', data:{type, ...(comment ? {comment} : {})}}))
  if (record.id !== id || record.job !== jobId) throw new ApiError('评价归属无效',502)
  return record
}
