import {
  AUTH_COLLECTION,
  DEFAULT_PAGE_SIZE,
  EVENT_COLLECTION,
  RUN_COLLECTION,
  TASK_COLLECTION,
} from './config'
import { clearSession, requireSession, saveBaseUrl, setSession } from './session'
import { parsePlanMeta } from './plan'
import type {
  AuthSession,
  DispatchEventRecord,
  DispatchRequestedAction,
  DispatchRunRecord,
  DispatchTaskRecord,
  PocketBaseListResponse,
} from '../types'

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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  data?: unknown
  query?: Record<string, string | number | boolean | undefined>
  baseUrl?: string
  token?: string
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = options.baseUrl ? null : requireSession()
  const baseUrl = options.baseUrl || session?.baseUrl || ''
  const token = options.token ?? session?.token
  const url = new URL(path, `${baseUrl}/`)
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: token } : {}),
    },
    body: options.data !== undefined ? JSON.stringify(options.data) : undefined,
    signal: options.signal,
  })

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
  if (record.owner !== session.record.id) throw new ApiError('接口返回的数据归属无效', 502, 'INVALID_RECORD_OWNER')
  return record
}

async function listCollection<T extends { owner: string }>(
  collection: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<PocketBaseListResponse<T>> {
  const response = await request<PocketBaseListResponse<T>>(`/api/collections/${collection}/records`, { query })
  if (!response || !Array.isArray(response.items)) throw new ApiError('接口返回的数据格式无效', 502, 'INVALID_API_RESPONSE')
  return { ...response, items: response.items.map(assertOwner) }
}

export async function collectPages<T extends { owner: string }>(
  first: PocketBaseListResponse<T>,
  load: (page: number) => Promise<PocketBaseListResponse<T>>,
): Promise<T[]> {
  const items = [...first.items]
  for (let page = 2; page <= first.totalPages; page += 1) items.push(...(await load(page)).items)
  return items
}

export async function login(identity: string, password: string, baseUrlValue: string): Promise<AuthSession> {
  if (!identity.trim() || !password) throw new ApiError('请输入邮箱和密码', 400, 'AUTH_INPUT_REQUIRED')
  const baseUrl = saveBaseUrl(baseUrlValue)
  const response = await request<{ token: string; record: { id: string; email: string; name?: string } }>(
    `/api/collections/${AUTH_COLLECTION}/auth-with-password`,
    { method: 'POST', baseUrl, data: { identity: identity.trim(), password } },
  )

  if (!response?.token || !response.record?.id || !response.record.email) {
    throw new ApiError('登录响应无效', 502, 'INVALID_AUTH_RESPONSE')
  }

  const session: AuthSession = { token: response.token, record: response.record, baseUrl }
  setSession(session)
  return session
}

export async function listRuns(page = 1, perPage = DEFAULT_PAGE_SIZE): Promise<PocketBaseListResponse<DispatchRunRecord>> {
  const session = requireSession()
  return listCollection<DispatchRunRecord>(RUN_COLLECTION, {
    page,
    perPage,
    sort: '-updated',
    filter: `owner="${quoteFilter(session.record.id)}"`,
  })
}

export async function listAllRuns(): Promise<DispatchRunRecord[]> {
  const first = await listRuns()
  return collectPages(first, (page) => listRuns(page, first.perPage))
}

export async function getRun(id: string): Promise<DispatchRunRecord> {
  return assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(id)}`))
}

export async function createRun(planText: string, status: 'draft' | 'queued'): Promise<DispatchRunRecord> {
  const session = requireSession()
  const meta = parsePlanMeta(planText)
  return assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records`, {
    method: 'POST',
    data: {
      owner: session.record.id,
      title: meta.title,
      planText,
      planChecksum: '',
      executionMode: meta.mode,
      maxConcurrency: meta.maxConcurrency,
      status,
      requestedAction: 'none',
      commandVersion: 0,
    },
  }))
}

export async function updateRunDraft(id: string, planText: string, publish = false): Promise<DispatchRunRecord> {
  const meta = parsePlanMeta(planText)
  return assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    data: {
      title: meta.title,
      planText,
      planChecksum: '',
      executionMode: meta.mode,
      maxConcurrency: meta.maxConcurrency,
      ...(publish ? { status: 'queued' as const } : {}),
    },
  }))
}

export async function commandRun(
  run: DispatchRunRecord,
  action: Exclude<DispatchRequestedAction, 'none'>,
): Promise<DispatchRunRecord> {
  const session = requireSession()
  if (run.owner !== session.record.id) throw new ApiError('当前 Run 不属于登录账号', 403, 'INVALID_RECORD_OWNER')
  if (!['queued', 'running'].includes(run.status)) throw new ApiError('当前状态不能执行 Run 控制命令', 409, 'INVALID_RUN_STATE')
  if (!Number.isSafeInteger(run.commandVersion)) throw new ApiError('Run 命令版本无效', 409, 'INVALID_COMMAND_VERSION')

  return assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(run.id)}`, {
    method: 'PATCH',
    data: { requestedAction: action, commandVersion: run.commandVersion + 1 },
  }))
}

export async function deleteRun(run: Pick<DispatchRunRecord, 'id' | 'owner' | 'status'>): Promise<void> {
  const session = requireSession()
  if (run.owner !== session.record.id) throw new ApiError('当前 Run 不属于登录账号', 403, 'INVALID_RECORD_OWNER')
  if (!['draft', 'succeeded', 'failed', 'canceled'].includes(run.status)) {
    throw new ApiError('进行中的 Run 不能删除，请先取消并等待结束', 409, 'ACTIVE_RUN_DELETE')
  }
  await request<void>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(run.id)}`, { method: 'DELETE' })
}

export async function cloneRun(source: DispatchRunRecord, status: 'draft' | 'queued'): Promise<DispatchRunRecord> {
  if (!source.planText.trim()) throw new ApiError('此 Run 没有可复制的工作流定义', 409, 'RUN_PLAN_MISSING')
  const suffix = status === 'draft' ? ' · 草稿' : ' · 重跑'
  const title = (source.title.trim() || '未命名工作流').slice(0, Math.max(1, 512 - suffix.length)) + suffix
  const planText = source.planText.replace(/^\s*@run\s*=.*$/imu, `@run=${title}`)
  return createRun(planText, status)
}

export async function listTasksForRun(runId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listCollection<DispatchTaskRecord>(TASK_COLLECTION, {
    page,
    perPage,
    sort: '+runIndex',
    filter: `run="${quoteFilter(runId)}"`,
  })
}

export async function listAllTasksForRun(runId: string): Promise<DispatchTaskRecord[]> {
  const first = await listTasksForRun(runId)
  return collectPages(first, (page) => listTasksForRun(runId, page, first.perPage))
}

export async function getTask(id: string): Promise<DispatchTaskRecord> {
  return assertOwner(await request<DispatchTaskRecord>(`/api/collections/${TASK_COLLECTION}/records/${encodeURIComponent(id)}`))
}

export async function listEventsForTask(taskId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listCollection<DispatchEventRecord>(EVENT_COLLECTION, {
    page,
    perPage,
    sort: '+eventIndex',
    filter: `task="${quoteFilter(taskId)}"`,
  })
}

export async function listAllEventsForTask(taskId: string): Promise<DispatchEventRecord[]> {
  const first = await listEventsForTask(taskId)
  return collectPages(first, (page) => listEventsForTask(taskId, page, first.perPage))
}

export async function getEvent(id: string): Promise<DispatchEventRecord> {
  return assertOwner(await request<DispatchEventRecord>(`/api/collections/${EVENT_COLLECTION}/records/${encodeURIComponent(id)}`))
}

export function toErrorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}
