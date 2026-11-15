import { ApiError, assertOwner, listOwnedCollection, quoteFilter, request } from './client'
import { requireSession } from './session'
import type { GeminiInput, GeminiJob, GeminiMessage, GeminiPreview } from '@/types/gemini'

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
export async function getGeminiJob(id: string, signal?: AbortSignal) {
  return assertOwner(
    await request<GeminiJob>(`/api/collections/aw_gemini_jobs/records/${encodeURIComponent(id)}`, { signal }),
  )
}
export async function listGeminiMessages(jobId: string, signal?: AbortSignal) {
  const response = await listOwnedCollection<GeminiMessage>(
    'aw_gemini_messages',
    {
      page: 1,
      perPage: 100,
      sort: 'index',
      filter: `owner="${quoteFilter(requireSession().record.id)}" && job="${quoteFilter(jobId)}"`,
      fields: 'id,owner,job,index,part,sourceName,status,error,finishReason,usage',
    },
    (row) => row,
    signal,
  )
  if (response.items.some((row) => row.job !== jobId)) throw new ApiError('分段归属无效', 502)
  return response.items
}
export async function getGeminiMessage(jobId: string, id: string, signal?: AbortSignal) {
  const record = assertOwner(
    await request<GeminiMessage>(`/api/collections/aw_gemini_messages/records/${encodeURIComponent(id)}`, {
      signal,
    }),
  )
  if (record.job !== jobId) throw new ApiError('分段归属无效', 502)
  return record
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
