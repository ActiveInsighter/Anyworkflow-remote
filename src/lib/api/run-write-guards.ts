/** Validation and write-verification helpers shared by Run create and update calls. */
import type { DispatchRunOrigin, DispatchRunRecord } from '../../types'
import type { DailyRecurrence } from '../domain/recurrence'
import { normalizeRuntimeConfig, type RuntimeConfig } from '../domain/runtime-config'
import { isFutureScheduledAt, isValidScheduledAt } from '../domain/schedule'
import { validateWorkflowSource } from '../workflow-dsl'
import { ApiError } from './client'
import { MAX_PLAN_TEXT_BYTES } from '../domain/limits'

/**
 * Rejects a schedule before PocketBase date-field coercion can erase malformed input. Empty is
 * valid: it means "no boundary, start immediately".
 */
export function checkedPlanText(value: string, requireExecutable = false): string {
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

export function checkedScheduledAt(value: string): string {
  const trimmed = value.trim()
  if (!isValidScheduledAt(trimmed)) {
    throw new ApiError('执行时间格式无效，需要带时区偏移的 ISO-8601 时刻', 400, 'INVALID_SCHEDULED_AT')
  }
  if (trimmed && !isFutureScheduledAt(trimmed)) {
    throw new ApiError('执行时间必须晚于当前时间', 400, 'SCHEDULED_AT_NOT_FUTURE')
  }
  return trimmed
}

export function isAmbiguousWriteFailure(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500)
}

export function isRunVersionConflict(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.status !== 400 ||
      !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) return false
  const fields = error.details as Record<string, unknown>
  const isUnique = (name: string): boolean => {
    const field = fields[name]
    return Boolean(field && typeof field === 'object' &&
      (field as { code?: unknown }).code === 'validation_not_unique')
  }
  return isUnique('familyId') && (isUnique('versionNumber') || (isUnique('versionMajor') && isUnique('versionMinor')))
}

export function newRunId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  while (id.length < 15) {
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    for (const byte of bytes) {
      if (byte >= 252) continue
      id += alphabet[byte % alphabet.length]
      if (id.length === 15) return id
    }
  }
  return id
}

function samePlanText(left: string, right: string): boolean {
  return left.replace(/\r\n?/gu, '\n').trim() === right.replace(/\r\n?/gu, '\n').trim()
}

export function sameScheduledAt(left: string, right: string): boolean {
  if (!left.trim() || !right.trim()) return !left.trim() && !right.trim()
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  return Number.isFinite(leftTime) && leftTime === rightTime
}

export function savedCreateMatches(
  run: DispatchRunRecord,
  expected: {
    title: string
    planText: string
    status: 'draft' | 'queued'
    scheduledAt: string
    executionMode: string
    maxConcurrency: number
    parentRun: string
    origin: DispatchRunOrigin
    runtimeConfig?: RuntimeConfig | null
    recurrence?: DailyRecurrence | null
  },
): boolean {
  const statusMatches = expected.status === 'draft'
    ? run.status === 'draft'
    : ['queued', 'running', 'succeeded', 'failed', 'canceled'].includes(run.status)
  return run.title === expected.title && samePlanText(run.planText, expected.planText) &&
    statusMatches && sameScheduledAt(run.scheduledAt, expected.scheduledAt) &&
    run.executionMode === expected.executionMode && run.maxConcurrency === expected.maxConcurrency &&
    JSON.stringify(run.recurrence ?? null) === JSON.stringify(expected.recurrence ?? null) &&
    run.parentRun === expected.parentRun && run.origin === expected.origin &&
    (expected.runtimeConfig === undefined || JSON.stringify(run.runtimeConfig) === JSON.stringify(expected.runtimeConfig))
}

export function savedDraftUpdateMatches(
  run: DispatchRunRecord,
  expected: { title: string; planText: string; executionMode: string; maxConcurrency: number },
  options: { publish?: boolean; scheduledAt?: string; runtimeConfig?: RuntimeConfig | null; recurrence?: DailyRecurrence | null },
): boolean {
  const statusMatches = options.publish
    ? ['queued', 'running', 'succeeded', 'failed', 'canceled'].includes(run.status)
    : run.status === 'draft'
  return statusMatches && run.title === expected.title && samePlanText(run.planText, expected.planText) &&
    run.executionMode === expected.executionMode && run.maxConcurrency === expected.maxConcurrency &&
    (options.recurrence === undefined || JSON.stringify(run.recurrence ?? null) === JSON.stringify(options.recurrence)) &&
    (options.scheduledAt === undefined || sameScheduledAt(run.scheduledAt, options.scheduledAt)) &&
    (options.runtimeConfig === undefined || options.runtimeConfig === null ||
      JSON.stringify(run.runtimeConfig) === JSON.stringify(normalizeRuntimeConfig(options.runtimeConfig)))
}
