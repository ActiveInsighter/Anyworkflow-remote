import { ApiError, assertOwner, request } from './client'
import { requireSession } from './session'
import type { ModelCatalog, SavedModel } from '@/types/models'

const API = '/api/anyworkflow/models'
export function getModelCatalog(signal?: AbortSignal) {
  return request<ModelCatalog>(`${API}/catalog`, { signal })
}
export async function listSavedModels(signal?: AbortSignal) {
  const rows = await request<SavedModel[]>(`${API}/saved`, { signal })
  if (!Array.isArray(rows)) throw new ApiError('模型列表格式无效', 502)
  return rows.map((row) => assertOwner(row))
}
export async function saveModel(modelId: string, name?: string) {
  return assertOwner(
    await request<SavedModel>(`${API}/saved`, {
      method: 'POST',
      data: { modelId, ...(name === undefined ? {} : { name }) },
    }),
  )
}
export function deleteSavedModel(id: string) {
  return request(`${API}/saved/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
export async function refreshModelCatalog() {
  const session = requireSession()
  const response = await fetch('/api/models/catalog/refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'X-PocketBase-Url': session.baseUrl },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new ApiError('暂时无法刷新模型目录，请稍后重试', response.status)
}
