import { crawlJobKind } from '@shared/task-kit/index.mjs'
import { parseWebUrls } from '@/lib/web-urls'
import type { CrawlDocument, CrawlJob, CrawlOptions, CrawlRunner, CrawlTarget, CrawlTargetInput, CrawlWorker } from '@/types/crawl'
import { ApiError, assertOwner, listOwnedCollection, quoteFilter, request } from './client'
import { requireSession } from './session'

/**
 * Web crawling. A job crawls one URL, in the cloud (the crawler's GitHub workflow, no login) or
 * in the owner's browser (the crawler's extension, signed in); a saved page (target) queues jobs
 * on its schedule. Results land in one document per page or post. PocketBase validates every
 * request and owns every transition (pb_hooks/crawl.js in AnyWorkflow-workers).
 */
const TARGETS = 'aw_crawl_targets'
const JOBS = crawlJobKind.collection
const DOCUMENTS = 'aw_crawl_documents'
const WORKERS = 'aw_crawl_workers'

export const MAX_CRAWL_TARGETS = 500
export const MAX_URLS_PER_SUBMIT = 50
const TARGET_PAGE_SIZE = 50
const JOB_PAGE_SIZE = 20
const DOCUMENT_PAGE_SIZE = 20
const ACTIVE_STATUSES = crawlJobKind.statusesIn('queued', 'running')
/** The extension claims every 30 s and the server records it at most once a minute. */
const WORKER_ONLINE_MS = 3 * 60_000
const X_HOSTS = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])
const X_STATUS_PATH = /^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/(?:web\/)?status)\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/u
// Lists read a short plain excerpt; the full record, which can be megabytes, loads when opened.
const DOCUMENT_LIST_FIELDS = [
  'id', 'owner', 'identity', 'target', 'job', 'runner', 'category', 'url', 'canonicalUrl', 'host', 'title', 'byline', 'siteName',
  'publishedAt', 'wordCount', 'extractor', 'profile', 'qualityScore', 'fetchedAt', 'changedAt', 'created', 'updated',
  'markdown:excerpt(160,true)',
].join(',')

/** How often a saved page is crawled; 0 means only when asked. Matches the server's 30 min – 7 day range. */
export const CRAWL_INTERVALS = [
  { minutes: 0, label: '仅手动' },
  { minutes: 30, label: '每 30 分钟' },
  { minutes: 60, label: '每小时' },
  { minutes: 180, label: '每 3 小时' },
  { minutes: 360, label: '每 6 小时' },
  { minutes: 720, label: '每 12 小时' },
  { minutes: 1440, label: '每天' },
  { minutes: 10080, label: '每周' },
] as const

/** PocketBase-compatible 15-character id; reusing one for a retried create keeps it idempotent. */
export function newCrawlId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 15)
}

export const parseCrawlUrls = parseWebUrls

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function isXUrl(url: string): boolean {
  return X_HOSTS.has(hostOf(url))
}

/** A link to one X post; other X pages (profiles, lists) need the visible scope. */
export function isXStatusUrl(url: string): boolean {
  try {
    return isXUrl(url) && X_STATUS_PATH.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** The category the server files a result under when none is given. */
export function defaultCategory(url: string): string {
  return isXUrl(url) ? 'social_media' : 'webpage'
}

/**
 * Only what differs from the defaults is stored, and only what the runner will read: the cloud
 * transport means nothing to the browser, and an item count only applies to the visible scope.
 */
export function compactCrawlOptions(options: CrawlOptions, runner: CrawlRunner): CrawlOptions {
  const compact: CrawlOptions = {}
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
  if (options.scope) compact.scope = options.scope
  if (options.scope === 'visible' && options.maxItems) compact.maxItems = options.maxItems
  if (runner === 'cloud' && options.transport) compact.transport = options.transport
  return compact
}

/** The options one URL is crawled with: an X profile has no single post, so it reads the visible ones. */
export function optionsForUrl(url: string, options: CrawlOptions, runner: CrawlRunner): CrawlOptions {
  const compact = compactCrawlOptions(options, runner)
  if (isXUrl(url) && !isXStatusUrl(url) && compact.scope !== 'visible') {
    compact.scope = 'visible'
    delete compact.maxItems
  }
  return compact
}

function ownerFilter(): string {
  return `owner="${quoteFilter(requireSession().record.id)}"`
}

/** Creates with a client id: a lost response or a retry never creates the record twice. */
async function createOnce<T extends { owner: string }>(collection: string, id: string, data: Record<string, unknown>): Promise<T> {
  const path = `/api/collections/${collection}/records`
  try {
    return assertOwner(await request<T>(path, { method: 'POST', data: { ...data, id } }))
  } catch (error) {
    try {
      return assertOwner(await request<T>(`${path}/${encodeURIComponent(id)}`))
    } catch { /* Keep the original create error. */ }
    throw error
  }
}

function withOptions<T extends { options: CrawlOptions | null }>(row: T): T & { options: CrawlOptions } {
  return { ...row, options: row.options ?? {} }
}

// Saved pages -----------------------------------------------------------------------------------

export function listCrawlTargets(page: number, signal?: AbortSignal) {
  return listOwnedCollection<CrawlTarget>(TARGETS, { page, perPage: TARGET_PAGE_SIZE, sort: '-created,-id', filter: ownerFilter() }, withOptions, signal)
}

export async function createCrawlTarget(id: string, input: CrawlTargetInput): Promise<CrawlTarget> {
  const options = optionsForUrl(input.url, input.options, input.runner)
  return withOptions(await createOnce<CrawlTarget>(TARGETS, id, { owner: requireSession().record.id, ...input, options }))
}

/** Sends only the given fields, so an untouched schedule keeps its next run time. */
export async function updateCrawlTarget(target: Pick<CrawlTarget, 'id' | 'owner' | 'url' | 'runner'>, patch: Partial<CrawlTargetInput>): Promise<CrawlTarget> {
  assertOwner(target)
  const data = patch.options ? { ...patch, options: optionsForUrl(patch.url ?? target.url, patch.options, patch.runner ?? target.runner) } : patch
  const row = await request<CrawlTarget>(`/api/collections/${TARGETS}/records/${encodeURIComponent(target.id)}`, { method: 'PATCH', data })
  return withOptions(assertOwner(row))
}

/** Its documents and jobs stay; they only lose the link to the page. */
export async function deleteCrawlTarget(target: Pick<CrawlTarget, 'id' | 'owner'>): Promise<void> {
  assertOwner(target)
  await request(`/api/collections/${TARGETS}/records/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
}

// Jobs ------------------------------------------------------------------------------------------

export function isCrawlJobActive(job: Pick<CrawlJob, 'id' | 'status'>): boolean {
  return crawlJobKind.describe(job).active
}

/** A succeeded or partial job points at the document it wrote. */
export function hasCrawlDocument(job: Pick<CrawlJob, 'status' | 'document'>): boolean {
  return Boolean(job.document) && (job.status === 'succeeded' || job.status === 'partial')
}

export interface JobQuery {
  page: number
  target?: string
}

export function listCrawlJobs(query: JobQuery, signal?: AbortSignal) {
  const filters = [ownerFilter()]
  if (query.target) filters.push(`target="${quoteFilter(query.target)}"`)
  return listOwnedCollection<CrawlJob>(JOBS, { page: query.page, perPage: JOB_PAGE_SIZE, sort: '-created,-id', filter: filters.join(' && ') }, (row) => row, signal)
}

/** Everything queued or running: what the page follows closely. The server allows 200 at once. */
export async function listActiveCrawlJobs(signal?: AbortSignal): Promise<CrawlJob[]> {
  const active = ACTIVE_STATUSES.map((status) => `status="${status}"`).join(' || ')
  const { items } = await listOwnedCollection<CrawlJob>(JOBS, {
    page: 1, perPage: 200, skipTotal: true, sort: '-created,-id', filter: `${ownerFilter()} && (${active})`,
  }, (row) => row, signal)
  return items
}

export interface CrawlRequest {
  url: string
  runner: CrawlRunner
  category: string
  options: CrawlOptions
}

/** One crawl of a link with its own settings. An empty category lets the server choose. */
export function createCrawlJob(id: string, input: CrawlRequest): Promise<CrawlJob> {
  return createOnce<CrawlJob>(JOBS, id, {
    owner: requireSession().record.id,
    url: input.url,
    runner: input.runner,
    category: input.category.trim(),
    options: optionsForUrl(input.url, input.options, input.runner),
  })
}

/** One crawl of a saved page; the server copies the page's own settings. */
export function crawlTarget(id: string, target: Pick<CrawlTarget, 'id' | 'owner'>): Promise<CrawlJob> {
  assertOwner(target)
  return createOnce<CrawlJob>(JOBS, id, { owner: target.owner, target: target.id })
}

/**
 * The same crawl again. A saved page's job crawls the page as it is set now; a link's job keeps
 * its settings, or moves to another runner (a page that needs a login, read in the browser).
 */
export function rerunCrawlJob(id: string, job: CrawlJob, runner: CrawlRunner = job.runner): Promise<CrawlJob> {
  assertOwner(job)
  if (isCrawlJobActive(job)) throw new ApiError('任务还没有结束', 409, 'JOB_ACTIVE')
  if (job.target && runner === job.runner) return createOnce<CrawlJob>(JOBS, id, { owner: job.owner, target: job.target, rerunOf: job.id })
  return createOnce<CrawlJob>(JOBS, id, {
    owner: job.owner,
    url: job.url,
    runner,
    category: job.category,
    options: optionsForUrl(job.url, job.options ?? {}, runner),
    rerunOf: job.id,
  })
}

/** A queued job stops at once; a running one when its executor next renews its lease. */
export async function cancelCrawlJob(job: Pick<CrawlJob, 'id' | 'owner' | 'status'>): Promise<void> {
  assertOwner(job)
  if (!isCrawlJobActive(job)) throw new ApiError('任务已经结束', 409, 'JOB_TERMINAL')
  await request(`/api/anyworkflow/crawl/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' })
}

/** The record only: the document it wrote stays. */
export async function deleteCrawlJob(job: Pick<CrawlJob, 'id' | 'owner' | 'status'>): Promise<void> {
  assertOwner(job)
  if (isCrawlJobActive(job)) throw new ApiError('任务还没有结束', 409, 'JOB_ACTIVE')
  await request(`/api/collections/${JOBS}/records/${encodeURIComponent(job.id)}`, { method: 'DELETE' })
}

// Documents -------------------------------------------------------------------------------------

export interface DocumentQuery {
  page: number
  target?: string
  category?: string
  search?: string
}

export function listCrawlDocuments(query: DocumentQuery, signal?: AbortSignal) {
  const filters = [ownerFilter()]
  if (query.target) filters.push(`target="${quoteFilter(query.target)}"`)
  if (query.category) filters.push(`category="${quoteFilter(query.category)}"`)
  const search = query.search?.trim()
  if (search) {
    const term = quoteFilter(search)
    filters.push(`(title~"${term}" || markdown~"${term}" || byline~"${term}" || siteName~"${term}" || url~"${term}")`)
  }
  return listOwnedCollection<CrawlDocument>(DOCUMENTS, {
    page: query.page, perPage: DOCUMENT_PAGE_SIZE, sort: '-fetchedAt,-id', fields: DOCUMENT_LIST_FIELDS, filter: filters.join(' && '),
  }, (row) => row, signal)
}

export async function getCrawlDocument(id: string, signal?: AbortSignal): Promise<CrawlDocument> {
  return assertOwner(await request<CrawlDocument>(`/api/collections/${DOCUMENTS}/records/${encodeURIComponent(id)}`, { signal }))
}

/** Gone for good; the next crawl that finds the page stores it again. */
export async function deleteCrawlDocument(document: Pick<CrawlDocument, 'id' | 'owner'>): Promise<void> {
  assertOwner(document)
  await request(`/api/collections/${DOCUMENTS}/records/${encodeURIComponent(document.id)}`, { method: 'DELETE' })
}

// Extensions ------------------------------------------------------------------------------------

export async function listCrawlWorkers(signal?: AbortSignal): Promise<CrawlWorker[]> {
  const { items } = await listOwnedCollection<CrawlWorker>(WORKERS, {
    page: 1, perPage: 20, skipTotal: true, sort: '-lastSeenAt', filter: ownerFilter(),
  }, (row) => row, signal)
  return items
}

export function isCrawlWorkerOnline(worker: Pick<CrawlWorker, 'lastSeenAt'>, now = Date.now()): boolean {
  const seen = Date.parse(worker.lastSeenAt.replace(' ', 'T'))
  return Number.isFinite(seen) && now - seen < WORKER_ONLINE_MS
}
