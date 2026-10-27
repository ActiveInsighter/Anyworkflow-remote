import { ApiError } from './client'
import { clearSession, getSession, requireSession } from './session'
import type { UploadedPdf } from './file-upload'

export interface LibraryFile extends UploadedPdf {
  id: string
  createdAt: string
}

export async function libraryRequest<T>(path = '', method: 'GET' | 'DELETE' | 'POST' = 'GET', signal?: AbortSignal): Promise<T> {
  const session = requireSession()
  let response: Response
  try {
    response = await fetch(`/api/library/files${path}`, {
      method, headers: { Accept: 'application/json', Authorization: `Bearer ${session.token}`, 'X-PocketBase-Url': session.baseUrl },
      signal: signal ?? AbortSignal.timeout(30_000),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('无法连接资料库，请检查网络后重试', 0, 'NETWORK_ERROR')
  }
  if (response.status === 204) return undefined as T
  let payload: unknown
  try { payload = await response.json() }
  catch { throw new ApiError('资料库返回的数据无效，请刷新重试', 502, 'INVALID_LIBRARY_RESPONSE') }
  if (!response.ok) {
    const current = getSession()
    if ((response.status === 401 || response.status === 403) && current?.token === session.token && current.baseUrl === session.baseUrl && current.record.id === session.record.id) clearSession()
    throw new ApiError(payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : '资料库操作失败，请重试', response.status)
  }
  return payload as T
}

export async function listLibraryFiles(signal?: AbortSignal, query = '') {
  let imported: unknown
  do {
    imported = await libraryRequest<unknown>('/import', 'POST', signal)
    if (!imported || typeof imported !== 'object' || !('done' in imported) || typeof imported.done !== 'boolean' || !('unavailable' in imported) || typeof imported.unavailable !== 'number') throw invalidResponse()
  } while (!imported.done)
  const result = await listLibraryFilePage('', signal, query)
  return { ...result, unavailable: imported.unavailable }
}

function invalidResponse() { return new ApiError('资料库返回的数据无效，请刷新重试', 502, 'INVALID_LIBRARY_RESPONSE') }

function normalizeFile(value: unknown): LibraryFile {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !value.id || !('fileName' in value) || typeof value.fileName !== 'string' || !value.fileName || !('size' in value) || typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 5 || !('createdAt' in value) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !('sourceUrl' in value) || typeof value.sourceUrl !== 'string' || !('expiresAt' in value) || value.expiresAt !== '') throw invalidResponse()
  try {
    const url = new URL(value.sourceUrl)
    if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith(`/${value.id}`)) throw invalidResponse()
  } catch { throw invalidResponse() }
  return { id: value.id, fileName: value.fileName, size: value.size, sourceUrl: value.sourceUrl, createdAt: value.createdAt, expiresAt: '' }
}

export async function listLibraryFilePage(cursor = '', signal?: AbortSignal, query = '') {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (query.trim()) params.set('q', query.trim())
  const value = await libraryRequest<unknown>(params.size ? `?${params}` : '', 'GET', signal)
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items) || !('cursor' in value) || typeof value.cursor !== 'string') throw invalidResponse()
  return { items: value.items.map(normalizeFile), cursor: value.cursor }
}

export async function getLibraryFile(id: string, signal?: AbortSignal) {
  const file = normalizeFile(await libraryRequest<unknown>(`/${encodeURIComponent(id)}`, 'GET', signal))
  if (file.id !== id) throw invalidResponse()
  return file
}

export function deleteLibraryFile(id: string) {
  return libraryRequest<void>(`/${encodeURIComponent(id)}`, 'DELETE')
}
