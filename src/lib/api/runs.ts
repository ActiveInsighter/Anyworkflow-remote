import type { DispatchRequestedAction, DispatchRunOrigin, DispatchRunRecord, PocketBaseListResponse } from '../../types'
import { parsePlanMeta } from '../domain/plan'
import { normalizeRecurrence, type DailyRecurrence } from '../domain/recurrence'
import { normalizeRuntimeConfig, type RuntimeConfig } from '../domain/runtime-config'
import { ApiError, assertOwner, collectPages, listOwnedCollection, request, quoteFilter } from './client'
import { DEFAULT_PAGE_SIZE, RUN_COLLECTION } from './config'
import { requireSession } from './session'
import { normalizeRun } from './normalize'
import { checkedPlanText, checkedScheduledAt, isAmbiguousWriteFailure, isRunVersionConflict, newRunId, sameScheduledAt, savedCreateMatches, savedDraftUpdateMatches } from './run-write-guards'

export type RunListFilter = 'all' | 'draft' | 'active' | 'done' | 'failed' | 'canceled'

function runFilterExpression(ownerId: string, filter: RunListFilter): string {
  const owner = `owner="${quoteFilter(ownerId)}"`
  if (filter === 'draft') return `${owner} && status="draft"`
  if (filter === 'active') return `${owner} && (status="queued" || status="running")`
  if (filter === 'done') return `${owner} && status="succeeded"`
  if (filter === 'failed' || filter === 'canceled') return `${owner} && status="${filter}"`
  return owner
}

export async function listRuns(
  page = 1,
  perPage = 30,
  filter: RunListFilter = 'all',
  search = '',
  signal?: AbortSignal,
): Promise<PocketBaseListResponse<DispatchRunRecord>> {
  const session = requireSession()
  return listOwnedCollection<DispatchRunRecord>(
    RUN_COLLECTION,
    {
      page,
      perPage,
      sort: '-updated',
      filter: runFilterExpression(session.record.id, filter) + (search.trim() ? ` && (title~"${quoteFilter(search.trim())}" || id="${quoteFilter(search.trim())}")` : ''),
    },
    normalizeRun,
    signal,
  )
}

export async function listRunVersions(familyId: string): Promise<DispatchRunRecord[]> {
  const first = await listOwnedCollection<DispatchRunRecord>(RUN_COLLECTION, {
    page: 1,
    perPage: DEFAULT_PAGE_SIZE,
    sort: '+versionNumber',
    filter: `familyId="${quoteFilter(familyId)}"`,
  }, normalizeRun)
  return collectPages(first, (page) => listOwnedCollection<DispatchRunRecord>(RUN_COLLECTION, {
    page,
    perPage: first.perPage,
    sort: '+versionNumber',
    filter: `familyId="${quoteFilter(familyId)}"`,
  }, normalizeRun))
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
  lineage: { parentRun: string; origin: Exclude<DispatchRunOrigin, 'initial'>; title?: string } | null = null,
  runtimeConfig?: RuntimeConfig | null,
  recurrence?: DailyRecurrence | null,
): Promise<DispatchRunRecord> {
  const session = requireSession()
  const checkedPlan = checkedPlanText(planText, status === 'queued')
  const meta = parsePlanMeta(checkedPlan)
  const checkedSchedule = checkedScheduledAt(scheduledAt)
  const origin: DispatchRunOrigin = lineage?.origin ?? 'initial'
  const checkedRuntime = runtimeConfig == null ? undefined : normalizeRuntimeConfig(runtimeConfig)
  const expected = {
    title: lineage?.title ?? meta.title,
    planText: checkedPlan,
    status,
    scheduledAt: checkedSchedule,
    executionMode: meta.mode,
    maxConcurrency: meta.maxConcurrency,
    parentRun: lineage?.parentRun ?? '',
    origin,
    runtimeConfig: checkedRuntime,
    recurrence: recurrence == null ? null : normalizeRecurrence(recurrence),
  }
  const runId = newRunId()
  const data: Record<string, unknown> = {
    id: runId,
    owner: session.record.id,
    title: expected.title,
    planText: expected.planText,
    planChecksum: '',
    executionMode: expected.executionMode,
    maxConcurrency: expected.maxConcurrency,
    status: expected.status,
    requestedAction: 'none',
    commandVersion: 0,
    ...(recurrence ? { recurrence: normalizeRecurrence(recurrence) } : {}),
    ...(checkedRuntime ? { runtimeConfig: checkedRuntime } : {}),
    ...(lineage ? { parentRun: lineage.parentRun, origin: lineage.origin } : {}),
  }
  // PocketBase date fields should be omitted for an immediate Run. Sending an
  // empty string is not needed for a new row and can fail date coercion in JSVM.
  if (checkedSchedule) data.scheduledAt = checkedSchedule

  let versionConflictRetries = 0
  while (true) {
    try {
      return normalizeRun(assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records`, {
        method: 'POST',
        data,
      })))
    } catch (error) {
      if (lineage && isRunVersionConflict(error)) {
        if (versionConflictRetries >= 7) {
          throw new ApiError('Run 版本分配冲突，请重试', 409, 'RUN_VERSION_CONFLICT', error.details)
        }
        const backoffMs = 25 * 2 ** versionConflictRetries + Math.floor(Math.random() * 25)
        versionConflictRetries += 1
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        continue
      }
      if (!isAmbiguousWriteFailure(error)) throw error
      try {
        const saved = await getRun(runId)
        if (savedCreateMatches(saved, expected)) return saved
      } catch {
        // Keep the original write error when the exact-ID verification read is unavailable.
      }
      throw error
    }
  }
}

/**
 * `scheduledAt` is deliberately optional rather than defaulting to `''`: omitting it leaves the
 * stored value untouched, so publishing a draft that is already scheduled keeps its moment.
 * Passing `''` explicitly is how a schedule is cleared.
 */
export async function updateRunDraft(
  id: string,
  planText: string,
  options: { publish?: boolean; scheduledAt?: string; runtimeConfig?: RuntimeConfig | null; recurrence?: DailyRecurrence | null } = {},
): Promise<DispatchRunRecord> {
  const current = await getRun(id)
  if (current.status !== 'draft') {
    throw new ApiError('只有草稿 Run 可以修改定义', 409, 'ACTIVE_RUN_EDIT')
  }
  const checkedPlan = checkedPlanText(planText, options.publish === true)
  const meta = parsePlanMeta(checkedPlan)
  const previousMeta = parsePlanMeta(current.planText)
  const data: Record<string, unknown> = {
    title: meta.title === previousMeta.title ? current.title : meta.title,
    planText: checkedPlan,
    planChecksum: '',
    executionMode: meta.mode,
    maxConcurrency: meta.maxConcurrency,
  }
  if (options.recurrence !== undefined) data.recurrence = options.recurrence === null ? null : normalizeRecurrence(options.recurrence)
  if (options.publish) data.status = 'queued'
  if (options.runtimeConfig != null) data.runtimeConfig = normalizeRuntimeConfig(options.runtimeConfig)
  if (options.scheduledAt !== undefined) {
    const checkedSchedule = checkedScheduledAt(options.scheduledAt)
    // Omit an unchanged empty date. PocketBase can reject an empty date value
    // during draft updates even though the field is already unset.
    if (!sameScheduledAt(current.scheduledAt, checkedSchedule)) data.scheduledAt = checkedSchedule
  }

  try {
    return normalizeRun(assertOwner(await request<DispatchRunRecord>(`/api/collections/${RUN_COLLECTION}/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      data,
    })))
  } catch (error) {
    if (!isAmbiguousWriteFailure(error)) throw error
    try {
      const saved = await getRun(id)
      if (savedDraftUpdateMatches(saved, {
        title: String(data.title),
        planText: checkedPlan,
        executionMode: meta.mode,
        maxConcurrency: meta.maxConcurrency,
      }, options)) return saved
    } catch {
      // Keep the original write error when the verification read is unavailable.
    }
    throw error
  }
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

/** Editing a terminal Run creates a new definition; the source remains immutable. */
export async function createEditedRun(
  sourceId: string,
  planText: string,
  status: 'draft' | 'queued',
  scheduledAt = '',
  runtimeConfig?: RuntimeConfig | null,
  recurrence?: DailyRecurrence | null,
): Promise<DispatchRunRecord> {
  const source = await getRun(sourceId)
  if (!['succeeded', 'failed', 'canceled'].includes(source.status)) {
    throw new ApiError('只能基于已结束的 Run 创建编辑版本', 409, 'RUN_NOT_TERMINAL')
  }
  return createRun(planText, status, scheduledAt, { parentRun: source.id, origin: 'edited_rerun' }, runtimeConfig, recurrence)
}

export async function cloneRun(source: DispatchRunRecord, status: 'draft' | 'queued'): Promise<DispatchRunRecord> {
  const session = requireSession()
  if (source.owner !== session.record.id) {
    throw new ApiError('当前 Run 不属于登录账号', 403, 'INVALID_RECORD_OWNER')
  }
  if (!source.planText.trim()) throw new ApiError('此 Run 没有可复制的工作流定义', 409, 'RUN_PLAN_MISSING')
  const suffix = status === 'draft' ? ' · 草稿' : ' · 重跑'
  const title = (source.title.trim() || '未命名工作流').slice(0, Math.max(1, 512 - suffix.length)) + suffix
  return createRun(source.planText, status, '', {
    parentRun: source.id,
    origin: status === 'draft' ? 'edited_rerun' : 'rerun',
    title,
  })
}
