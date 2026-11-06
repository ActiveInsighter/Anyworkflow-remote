import { pageCaptureKind } from '@shared/task-kit/index.mjs'
import type { CaptureJob, CaptureOptions, CaptureResult, CaptureWorker } from '@/types/page-capture'
import { ApiError, assertOwner, listOwnedCollection, quoteFilter, request } from './client'
import { requireSession } from './session'

const JOBS = pageCaptureKind.collection
const RESULTS = 'aw_capture_results'
const WORKERS = 'aw_capture_workers'

export const MAX_CAPTURE_URLS = 50
const MAX_URL_LENGTH = 2048
/** The extension reports in at least every 30 s while it is running. */
const WORKER_ONLINE_MS = 2 * 60_000

/** PocketBase-compatible 15-character id; reusing one for a retried create keeps it idempotent. */
export function newCaptureId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 15)
}

export function isCaptureJobActive(job: Pick<CaptureJob, 'id' | 'status'>): boolean {
  return pageCaptureKind.describe(job).active
}

/** A finished job may be rerun or deleted. */
export function isCaptureJobFinished(job: Pick<CaptureJob, 'id' | 'status'>): boolean {
  return !isCaptureJobActive(job)
}

export function hasCaptureResult(job: Pick<CaptureJob, 'status'>): boolean {
  return job.status === 'succeeded' || job.status === 'partial'
}

export function isCaptureWorkerOnline(worker: Pick<CaptureWorker, 'lastSeenAt'>, now = Date.now()): boolean {
  const seen = Date.parse(worker.lastSeenAt.replace(' ', 'T'))
  return Number.isFinite(seen) && now - seen < WORKER_ONLINE_MS
}

function readUrl(line: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/iu.test(line) ? line : `https://${line}`
  if (candidate.length > MAX_URL_LENGTH) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Splits pasted text into unique web URLs, keeping what cannot be read so the user can fix it. */
export function parseCaptureUrls(text: string): { urls: string[]; invalid: string[] } {
  const urls = new Set<string>()
  const invalid: string[] = []
  for (const line of text.split(/\s+/u).filter(Boolean)) {
    const url = readUrl(line)
    if (url) urls.add(url)
    else invalid.push(line)
  }
  return { urls: [...urls], invalid }
}

/** Empty fields stay out of the record, so a job only stores what the user actually changed. */
export function compactCaptureOptions(options: CaptureOptions): CaptureOptions {
  const compact: CaptureOptions = {}
  const waitFor = options.waitFor?.trim()
  const contentSelector = options.contentSelector?.trim()
  const removeSelectors = options.removeSelectors?.map((selector) => selector.trim()).filter(Boolean)
  if (waitFor) compact.waitFor = waitFor
  if (contentSelector) compact.contentSelector = contentSelector
  if (removeSelectors?.length) compact.removeSelectors = removeSelectors
  if (options.scroll) compact.scroll = true
  if (options.keepHtml) compact.keepHtml = true
  if (options.generic) compact.generic = true
  if (options.timeoutSeconds) compact.timeoutSeconds = options.timeoutSeconds
  return compact
}

export function listCaptureJobs(page: number, signal?: AbortSignal) {
  return listOwnedCollection<CaptureJob>(JOBS, {
    page, perPage: 20, sort: '-created,-id', filter: `owner="${quoteFilter(requireSession().record.id)}"`,
  }, (row) => row, signal)
}

async function saveJob(id: string, data: Record<string, unknown>): Promise<CaptureJob> {
  const path = `/api/collections/${JOBS}/records`
  try {
    return assertOwner(await request<CaptureJob>(path, { method: 'POST', data: { ...data, id } }))
  } catch (error) {
    // A lost response or a retry with the same id must not queue the page twice.
    try {
      return assertOwner(await request<CaptureJob>(`${path}/${encodeURIComponent(id)}`))
    } catch { /* Keep the original create error. */ }
    throw error
  }
}

export function createCaptureJob(id: string, url: string, options: CaptureOptions): Promise<CaptureJob> {
  return saveJob(id, { owner: requireSession().record.id, url, options: compactCaptureOptions(options) })
}

export function rerunCaptureJob(id: string, job: CaptureJob): Promise<CaptureJob> {
  assertOwner(job)
  if (!isCaptureJobFinished(job)) throw new ApiError('任务还没有结束', 409, 'JOB_ACTIVE')
  return saveJob(id, { owner: job.owner, url: job.url, options: job.options ?? {}, rerunOf: job.id })
}

/** Queued jobs stop at once; a running one stops when its extension next checks in. */
export async function cancelCaptureJob(job: Pick<CaptureJob, 'id' | 'owner' | 'status'>): Promise<void> {
  assertOwner(job)
  if (!isCaptureJobActive(job)) throw new ApiError('任务已经结束', 409, 'JOB_TERMINAL')
  await request(`/api/anyworkflow/capture/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' })
}

export async function deleteCaptureJob(job: Pick<CaptureJob, 'id' | 'owner' | 'status'>): Promise<void> {
  assertOwner(job)
  if (!isCaptureJobFinished(job)) throw new ApiError('任务还没有结束', 409, 'JOB_ACTIVE')
  await request(`/api/collections/${JOBS}/records/${encodeURIComponent(job.id)}`, { method: 'DELETE' })
}

export async function getCaptureResult(jobId: string, signal?: AbortSignal): Promise<CaptureResult> {
  const owner = quoteFilter(requireSession().record.id)
  const { items } = await listOwnedCollection<CaptureResult>(RESULTS, {
    page: 1, perPage: 1, skipTotal: true, filter: `owner="${owner}" && job="${quoteFilter(jobId)}"`,
  }, (row) => row, signal)
  const result = items[0]
  if (!result) throw new ApiError('采集结果不存在', 404, 'RESULT_NOT_FOUND')
  return result
}

export async function listCaptureWorkers(signal?: AbortSignal): Promise<CaptureWorker[]> {
  const { items } = await listOwnedCollection<CaptureWorker>(WORKERS, {
    page: 1, perPage: 20, skipTotal: true, sort: '-lastSeenAt', filter: `owner="${quoteFilter(requireSession().record.id)}"`,
  }, (row) => row, signal)
  return items
}
