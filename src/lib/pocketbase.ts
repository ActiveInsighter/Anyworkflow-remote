import { clearSession, requireSession } from './session'
import type { PocketBaseListResponse } from '../types'

export class ApiError extends Error {
  status: number
  code: string

  constructor(message: string, status = 0, code = 'REQUEST_FAILED') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const candidate = payload as { message?: unknown; data?: unknown }
  let message = typeof candidate.message === 'string' && candidate.message.trim() ? candidate.message.trim() : fallback
  if (candidate.data && typeof candidate.data === 'object') {
    const field = Object.entries(candidate.data as Record<string, unknown>).find(([, value]) =>
      Boolean(value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string'),
    )
    if (field) message += `（${field[0]}：${(field[1] as { message: string }).message}）`
  }
  return message
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  data?: unknown
  query?: Record<string, string | number | boolean | undefined>
  baseUrl?: string
  token?: string
  signal?: AbortSignal
}

/** Shared list transport: validate the response shape and ownership before domain parsing. */
export async function listOwnedCollection<T extends { owner: string }, R extends { owner: string } = T>(
  collection: string,
  query: Record<string, string | number | boolean | undefined>,
  normalize: (record: T) => R,
  signal?: AbortSignal,
): Promise<PocketBaseListResponse<R>> {
  const response = await request<PocketBaseListResponse<T>>(`/api/collections/${collection}/records`, { query, signal })
  if (!response || !Array.isArray(response.items)) {
    throw new ApiError('接口返回的数据格式无效', 502, 'INVALID_API_RESPONSE')
  }
  return { ...response, items: response.items.map((item) => normalize(assertOwner(item))) }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = options.baseUrl ? null : requireSession()
  const baseUrl = options.baseUrl || session?.baseUrl || ''
  const token = options.token ?? session?.token
  const url = new URL(path, `${baseUrl}/`)
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: token } : {}),
      },
      body: options.data !== undefined ? JSON.stringify(options.data) : undefined,
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    throw new ApiError('无法连接 AnyWorkflow，请检查网络或 PocketBase 地址', 0, 'NETWORK_ERROR')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearSession()
    throw new ApiError(errorMessage(payload, `请求失败（${response.status}）`), response.status)
  }

  return payload as T
}

export function quoteFilter(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')
}

export function assertOwner<T extends { owner: string }>(record: T): T {
  const session = requireSession()
  if (!record || typeof record !== 'object' || typeof (record as { owner?: unknown }).owner !== 'string') {
    throw new ApiError('接口返回的数据格式无效', 502, 'INVALID_API_RESPONSE')
  }
  if (record.owner !== session.record.id) throw new ApiError('接口返回的数据归属无效', 502, 'INVALID_RECORD_OWNER')
  return record
}

export async function collectPages<T extends { owner: string }>(
  first: PocketBaseListResponse<T>,
  load: (page: number) => Promise<PocketBaseListResponse<T>>,
  maxItems = 500,
): Promise<T[]> {
  const items = [...first.items].slice(0, maxItems)
  for (let page = 2; page <= first.totalPages && items.length < maxItems; page += 1) {
    items.push(...(await load(page)).items.slice(0, maxItems - items.length))
  }
  return items
}
