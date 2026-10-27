import { runExportKind } from '@shared/task-kit/index.mjs'
import type { RunExportContent, RunExportRecord } from '../../types/run-export'
import { ApiError, assertOwner, listOwnedCollection, quoteFilter, request } from './client'
import { requireSession } from './session'

const COLLECTION = 'aw_run_exports'
const BASE = `/api/collections/${COLLECTION}/records`
const MAX_ZIP_BYTES = 100 * 1024 * 1024
const STATUSES = new Set(['queued', 'collecting', 'packaging', 'succeeded', 'failed', 'expired'])

function normalize(row: RunExportRecord, runId: string): RunExportRecord {
  if (!row.id || row.run !== runId || !STATUSES.has(row.status) ||
      !['assistant', 'conversation'].includes(row.contentMode) ||
      !Number.isSafeInteger(row.progress) || row.progress < 0 || row.progress > 100 ||
      !Number.isSafeInteger(row.messageCount) || row.messageCount < 0 ||
      !Number.isSafeInteger(row.documentCount) || row.documentCount < 0 ||
      !Number.isSafeInteger(row.fileSize) || row.fileSize < 0 || row.fileSize > MAX_ZIP_BYTES ||
      typeof row.file !== 'string' || typeof row.expiresAt !== 'string' ||
      (row.warnings !== null && (!Array.isArray(row.warnings) || row.warnings.some(value => typeof value !== 'string')))) {
    throw new ApiError('导出记录格式无效，请刷新后重试', 502, 'INVALID_EXPORT')
  }
  return row
}

export function isRunExportActive(row: Pick<RunExportRecord, 'status'>): boolean {
  return runExportKind.isActive(row.status)
}

export function canDownloadRunExport(row: Pick<RunExportRecord, 'status' | 'file' | 'expiresAt'>): boolean {
  return row.status === 'succeeded' && Boolean(row.file) && Date.parse(row.expiresAt.replace(' ', 'T')) > Date.now()
}

export function listRunExports(runId: string, page: number, signal?: AbortSignal) {
  return listOwnedCollection<RunExportRecord>(COLLECTION, {
    filter: `owner="${quoteFilter(requireSession().record.id)}" && run="${quoteFilter(runId)}"`,
    page, perPage: 10, sort: '-created,-id',
  }, row => normalize(row, runId), signal)
}

/** Caller retains the id after an ambiguous POST so retry cannot duplicate the export. */
export async function createRunExport(id: string, runId: string, contentMode: RunExportContent, signal?: AbortSignal) {
  if (!/^[a-z0-9]{15}$/u.test(id) || !runId || !['conversation', 'assistant'].includes(contentMode)) {
    throw new ApiError('导出参数无效', 400, 'INVALID_EXPORT_INPUT')
  }
  const session = requireSession()
  const data = { id, owner: session.record.id, run: runId, contentMode, status: 'queued' }
  const checked = (row: RunExportRecord) => normalize(assertOwner(row), runId)
  try {
    const row = await request<RunExportRecord>(BASE, { method: 'POST', data, signal })
    if (requireSession() !== session) throw new ApiError('账户已切换，请刷新导出记录', 409, 'SESSION_CHANGED')
    return checked(row)
  } catch (error) {
    if (signal?.aborted || (error instanceof ApiError && [401, 403].includes(error.status))) throw error
    if (requireSession() !== session) throw new ApiError('账户已切换，请刷新导出记录', 409, 'SESSION_CHANGED')
    try {
      const saved = checked(await request<RunExportRecord>(`${BASE}/${encodeURIComponent(id)}`, { signal }))
      if (saved.contentMode === contentMode) return saved
    } catch { /* Keep the original error when no identical export was committed. */ }
    throw error
  }
}

/** Only a fresh protected-file token is used; it is never persisted into UI state. */
export async function downloadRunExport(row: RunExportRecord, signal?: AbortSignal): Promise<Blob> {
  assertOwner(row)
  normalize(row, row.run)
  if (!canDownloadRunExport(row)) {
    throw new ApiError('文件已过期或尚未生成，请重新导出', 409, 'EXPORT_UNAVAILABLE')
  }
  const session = requireSession()
  const { token } = await request<{ token: string }>('/api/files/token', { method: 'POST', signal })
  if (!token) throw new ApiError('无法获取下载权限，请重新登录', 502, 'INVALID_FILE_TOKEN')
  if (requireSession() !== session) throw new ApiError('账户已切换，请重新下载', 409, 'SESSION_CHANGED')
  const url = new URL(`/api/files/${COLLECTION}/${encodeURIComponent(row.id)}/${encodeURIComponent(row.file)}`, session.baseUrl)
  url.searchParams.set('token', token)
  url.searchParams.set('download', '1')
  const downloadSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000)
  const response = await fetch(url, { signal: downloadSignal, redirect: 'error', credentials: 'omit' })
  if (!response.ok) throw new ApiError('下载失败，文件可能已过期，请刷新后重试', response.status, 'DOWNLOAD_FAILED')
  if (Number(response.headers.get('content-length')) > MAX_ZIP_BYTES) {
    await response.body?.cancel()
    throw new ApiError('导出文件超过下载上限', 502, 'EXPORT_TOO_LARGE')
  }
  if (!response.body) throw new ApiError('下载内容为空', 502, 'EMPTY_EXPORT')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const reader = response.body.getReader()
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_ZIP_BYTES) {
        await reader.cancel()
        throw new ApiError('导出文件超过下载上限', 502, 'EXPORT_TOO_LARGE')
      }
      chunks.push(new Uint8Array(value))
    }
  } finally { reader.releaseLock() }
  if (!size || size !== row.fileSize) throw new ApiError('下载文件不完整，请重试', 502, 'INCOMPLETE_EXPORT')
  if (requireSession() !== session) throw new ApiError('账户已切换，请重新下载', 409, 'SESSION_CHANGED')
  return new Blob(chunks, { type: 'application/zip' })
}
