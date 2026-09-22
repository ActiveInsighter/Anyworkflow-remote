import {
  AUTH_COLLECTION,
  DEFAULT_PAGE_SIZE,
  EVENT_COLLECTION,
  HISTORY_ACT_COLLECTION,
  HISTORY_EVENT_COLLECTION,
  HISTORY_MESSAGE_COLLECTION,
  MAX_PLAN_TEXT_BYTES,
  RUN_COLLECTION,
  TASK_COLLECTION,
} from './config'
import { requireSession, saveBaseUrl, setSession } from './session'
import { parsePlanMeta } from './plan'
import { isFutureScheduledAt, isValidScheduledAt } from './schedule'
import { validateWorkflowSource } from './workflow-dsl'
import { selectHistoryEventsForDispatchEvent } from './history'
import { ApiError, assertOwner, collectPages, listOwnedCollection, quoteFilter, request } from './pocketbase'
import type {
  AuthSession,
  DispatchEventRecord,
  DispatchExecutorKind,
  DispatchRequestedAction,
  DispatchRunRecord,
  DispatchTaskRecord,
  PocketBaseListResponse,
  WorkflowHistoryActRecord,
  WorkflowHistoryEventRecord,
  WorkflowHistoryMessageRecord,
} from '../types'

export { ApiError, assertOwner, collectPages, quoteFilter, request } from './pocketbase'

/**
 * `scheduledAt` was added to the deployment after some Runs already existed, and PocketBase's
 * date field reads back as an empty string. Normalising on the way in keeps every downstream
 * truthiness check off the `undefined` case.
 */
function normalizeRun<T extends DispatchRunRecord>(run: T): T {
  return { ...run, scheduledAt: typeof run.scheduledAt === 'string' ? run.scheduledAt : '' }
}

function normalizeTask<T extends DispatchTaskRecord>(task: T): T {
  const executorKind: DispatchExecutorKind = task.executorKind === 'codex' ? 'codex' : 'browser'
  return { ...task, executorKind }
}

/**
 * Rejects a schedule before it reaches the API. The PocketBase hook performs the same check and
 * answers with an opaque 400, so failing here is what turns a bad instant into an actionable
 * message. Empty is always valid: it means "no boundary, start immediately".
 */
function checkedPlanText(value: string, requireExecutable = false): string {
  if (!value.trim()) throw new ApiError('工作流定义不能为空', 400, 'RUN_PLAN_REQUIRED')
  if (new TextEncoder().encode(value).byteLength > MAX_PLAN_TEXT_BYTES) {
    throw new ApiError('工作流定义超过 2 MiB', 400, 'RUN_PLAN_TOO_LARGE')
  }
  if (requireExecutable) {
    const firstError = validateWorkflowSource(value).find((diagnostic) => diagnostic.severity === 'error')
    if (firstError) throw new ApiError(firstError.message, 400, 'RUN_PLAN_INVALID')
  }
  return value
}

function checkedScheduledAt(value: string): string {
  const trimmed = value.trim()
  if (!isValidScheduledAt(trimmed)) {
    throw new ApiError('执行时间格式无效，需要带时区偏移的 ISO-8601 时刻', 400, 'INVALID_SCHEDULED_AT')
  }
  if (trimmed && !isFutureScheduledAt(trimmed)) {
    throw new ApiError('执行时间必须晚于当前时间', 400, 'SCHEDULED_AT_NOT_FUTURE')
  }
  return trimmed
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

export type RunListFilter = 'all' | 'draft' | 'active' | 'done'

function runFilterExpression(ownerId: string, filter: RunListFilter): string {
  const owner = `owner="${quoteFilter(ownerId)}"`
  if (filter === 'draft') return `${owner} && status="draft"`
  if (filter === 'active') return `${owner} && (status="queued" || status="running")`
  if (filter === 'done') return `${owner} && (status="succeeded" || status="failed" || status="canceled")`
  return owner
}

export async function listRuns(
  page = 1,
  perPage = 30,
  filter: RunListFilter = 'all',
): Promise<PocketBaseListResponse<DispatchRunRecord>> {
  const session = requireSession()
  return listOwnedCollection<DispatchRunRecord>(
    RUN_COLLECTION,
    {
      page,
      perPage,
      sort: '-updated',
      filter: runFilterExpression(session.record.id, filter),
    },
    normalizeRun,
  )
}

export async function getRun(id: string): Promise<DispatchRunRecord> {
  return normalizeRun(
    assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(id)}`)),
  )
}

export async function createRun(
  planText: string,
  status: 'draft' | 'queued',
  scheduledAt = '',
): Promise<DispatchRunRecord> {
  const session = requireSession()
  const checkedPlan = checkedPlanText(planText, status === 'queued')
  const meta = parsePlanMeta(checkedPlan)
  return normalizeRun(assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records`, {
    method: 'POST',
    data: {
      owner: session.record.id,
      title: meta.title,
      planText: checkedPlan,
      planChecksum: '',
      executionMode: meta.mode,
      maxConcurrency: meta.maxConcurrency,
      status,
      requestedAction: 'none',
      commandVersion: 0,
      scheduledAt: checkedScheduledAt(scheduledAt),
    },
  })))
}

/**
 * `scheduledAt` is deliberately optional rather than defaulting to `''`: omitting it leaves the
 * stored value untouched, so publishing a draft that is already scheduled keeps its moment.
 * Passing `''` explicitly is how a schedule is cleared.
 */
export async function updateRunDraft(
  id: string,
  planText: string,
  options: { publish?: boolean; scheduledAt?: string } = {},
): Promise<DispatchRunRecord> {
  const current = await getRun(id)
  if (current.status !== 'draft') {
    throw new ApiError('只有草稿 Run 可以修改定义', 409, 'ACTIVE_RUN_EDIT')
  }
  const checkedPlan = checkedPlanText(planText, options.publish === true)
  const meta = parsePlanMeta(checkedPlan)
  const data: Record<string, unknown> = {
    title: meta.title,
    planText: checkedPlan,
    planChecksum: '',
    executionMode: meta.mode,
    maxConcurrency: meta.maxConcurrency,
  }
  if (options.publish) data.status = 'queued'
  if (options.scheduledAt !== undefined) data.scheduledAt = checkedScheduledAt(options.scheduledAt)

  return normalizeRun(assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    data,
  })))
}

export async function commandRun(
  run: DispatchRunRecord,
  action: Exclude<DispatchRequestedAction, 'none'>,
): Promise<DispatchRunRecord> {
  const session = requireSession()
  if (run.owner !== session.record.id) throw new ApiError('当前 Run 不属于登录账号', 403, 'INVALID_RECORD_OWNER')
  if (!['queued', 'running'].includes(run.status)) throw new ApiError('当前状态不能执行 Run 控制命令', 409, 'INVALID_RUN_STATE')
  if (!Number.isSafeInteger(run.commandVersion)) throw new ApiError('Run 命令版本无效', 409, 'INVALID_COMMAND_VERSION')

  return normalizeRun(assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(run.id)}`, {
    method: 'PATCH',
    data: { requestedAction: action, commandVersion: run.commandVersion + 1 },
  })))
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
  const session = requireSession()
  if (source.owner !== session.record.id) {
    throw new ApiError('当前 Run 不属于登录账号', 403, 'INVALID_RECORD_OWNER')
  }
  if (!source.planText.trim()) throw new ApiError('此 Run 没有可复制的工作流定义', 409, 'RUN_PLAN_MISSING')
  const suffix = status === 'draft' ? ' · 草稿' : ' · 重跑'
  const title = (source.title.trim() || '未命名工作流').slice(0, Math.max(1, 512 - suffix.length)) + suffix
  const planText = source.planText.replace(/^\s*@run\s*=.*$/imu, `@run=${title}`)
  return createRun(planText, status)
}

export async function listTasksForRun(runId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listOwnedCollection<DispatchTaskRecord>(TASK_COLLECTION, {
    page,
    perPage,
    sort: '+runIndex',
    filter: `run="${quoteFilter(runId)}"`,
  }, normalizeTask)
}

export async function getTask(id: string): Promise<DispatchTaskRecord> {
  return normalizeTask(assertOwner(await request<DispatchTaskRecord>(`/api/collections/${TASK_COLLECTION}/records/${encodeURIComponent(id)}`)))
}

export async function listEventsForTask(taskId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listOwnedCollection<DispatchEventRecord>(EVENT_COLLECTION, {
    page,
    perPage,
    sort: '+eventIndex',
    filter: `task="${quoteFilter(taskId)}"`,
  }, (record) => record)
}

export async function getEvent(id: string): Promise<DispatchEventRecord> {
  return assertOwner(await request<DispatchEventRecord>(`/api/collections/${EVENT_COLLECTION}/records/${encodeURIComponent(id)}`))
}

/**
 * Dispatch keeps the local executor run id on an Event. The history writer uses
 * that same value as aw_tasks.taskId, so the relation chain can be traversed
 * without adding a second foreign key to the dispatch collections.
 */
export async function listHistoryEventsForLocalRun(
  localRunId: string,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
  eventIndex?: number,
) {
  const eventIndexFilter = Number.isSafeInteger(eventIndex) ? ` && eventIndex = ${eventIndex}` : ''
  return listOwnedCollection<WorkflowHistoryEventRecord>(HISTORY_EVENT_COLLECTION, {
    page,
    perPage,
    sort: '+eventIndex',
    filter: `task.taskId="${quoteFilter(localRunId)}"${eventIndexFilter}`,
  }, (record) => record)
}

export async function listAllHistoryEventsForLocalRun(
  localRunId: string,
  eventIndex?: number,
): Promise<WorkflowHistoryEventRecord[]> {
  const first = await listHistoryEventsForLocalRun(localRunId, 1, DEFAULT_PAGE_SIZE, eventIndex)
  return collectPages(first, (page) => listHistoryEventsForLocalRun(localRunId, page, first.perPage, eventIndex))
}

export async function listHistoryActsForEvent(historyEventId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listOwnedCollection<WorkflowHistoryActRecord>(HISTORY_ACT_COLLECTION, {
    page,
    perPage,
    sort: '+actIndex',
    filter: `event="${quoteFilter(historyEventId)}"`,
  }, (record) => record)
}

export async function listAllHistoryActsForEvent(historyEventId: string): Promise<WorkflowHistoryActRecord[]> {
  const first = await listHistoryActsForEvent(historyEventId)
  return collectPages(first, (page) => listHistoryActsForEvent(historyEventId, page, first.perPage))
}

export async function listHistoryActsForDispatchEvent(event: DispatchEventRecord): Promise<WorkflowHistoryActRecord[]> {
  if (!event.localRunId) return []
  const historyEvents = selectHistoryEventsForDispatchEvent(
    await listAllHistoryEventsForLocalRun(event.localRunId, event.eventIndex),
    event,
  )
  const acts = (await Promise.all(historyEvents.map((historyEvent) => listAllHistoryActsForEvent(historyEvent.id)))).flat()
  return acts.sort((left, right) => left.actIndex - right.actIndex || left.id.localeCompare(right.id))
}

export async function listHistoryMessagesForAct(actId: string, page = 1, perPage = DEFAULT_PAGE_SIZE) {
  return listOwnedCollection<WorkflowHistoryMessageRecord>(HISTORY_MESSAGE_COLLECTION, {
    page,
    perPage,
    sort: '+nodeIndex',
    filter: `act="${quoteFilter(actId)}"`,
  }, (record) => record)
}

export async function listAllHistoryMessagesForAct(actId: string): Promise<WorkflowHistoryMessageRecord[]> {
  const first = await listHistoryMessagesForAct(actId)
  return collectPages(first, (page) => listHistoryMessagesForAct(actId, page, first.perPage))
}

export function toErrorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}
