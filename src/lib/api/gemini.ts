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
