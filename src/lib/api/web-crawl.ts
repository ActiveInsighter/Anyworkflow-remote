import { webCrawlKind } from '@shared/task-kit/index.mjs'
import { parseWebUrls } from '@/lib/web-urls'
import type { CrawledContent, CrawlOptions, CrawlRun, CrawlTarget, CrawlTargetInput } from '@/types/web-crawl'
import { ApiError, assertOwner, listOwnedCollection, quoteFilter, request } from './client'
import { requireSession } from './session'

/**
 * Web crawling: owners keep a list of pages (targets); the scheduler crawls due ones in runs of up
 * to 10 on the webpage-parser-action workflow, which stores what it finds in `aw_crawled_contents`.
 * PocketBase validates targets and owns every run transition (pb_hooks/crawl.js in AnyWorkflow-workers).
 */
export const CRAWL_TARGETS = 'aw_crawl_targets'
const RUNS = webCrawlKind.collection
const CONTENTS = 'aw_crawled_contents'

export const MAX_CRAWL_TARGETS = 200
export const MAX_TARGETS_PER_RUN = 10
const TARGET_PAGE_SIZE = 50
const RUN_PAGE_SIZE = 20
const CONTENT_PAGE_SIZE = 20
const ACTIVE_STATUSES = webCrawlKind.statusesIn('queued', 'running')
const X_HOSTS = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])
const X_STATUS_PATH = /^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/(?:web\/)?status)\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/u
/** Public run logs of the crawler; they hold run ids only, never URLs or content. */
const CRAWLER_RUNS_URL = 'https://github.com/ActiveInsighter/webpage-parser-action/actions/runs'
// Lists show a short plain-text excerpt; full content is loaded when one is opened.
const CONTENT_LIST_FIELDS = [
  'id', 'owner', 'target', 'run', 'type', 'platform', 'source', 'canonicalUrl', 'externalId', 'title', 'author', 'handle',
  'publishedAt', 'fetchedAt', 'changedAt', 'created', 'updated', 'content:excerpt(160,true)',
].join(',')

/** How often a target is crawled; 0 means only when asked. Matches the 30 min – 7 day server range. */
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

/** Whether a target crawls X posts, as the crawler decides it. */
export function crawlsX(target: Pick<CrawlTargetInput, 'url' | 'mode'>): boolean {
  return target.mode === 'x' || (target.mode === 'auto' && X_HOSTS.has(hostOf(target.url)))
}

/** X profiles show many posts, so they need the visible scope; a status link names exactly one. */
export function isXStatusUrl(url: string): boolean {
  try {
    return X_HOSTS.has(new URL(url).hostname.toLowerCase()) && X_STATUS_PATH.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** The category the server picks when none is given. */
export function defaultContentType(target: Pick<CrawlTargetInput, 'url' | 'mode'>): string {
  return crawlsX(target) ? 'social_media' : 'webpage'
}

/** Empty fields stay out of the record, so a target only stores what its owner changed. */
export function compactCrawlOptions(options: CrawlOptions): CrawlOptions {
  const compact: CrawlOptions = {}
  const text = (value: string | undefined) => value?.trim() || undefined
  const number = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  const entries: [keyof CrawlOptions, unknown][] = [
    ['selector', text(options.selector)],
    ['attribute', text(options.attribute)],
    ['waitFor', text(options.waitFor)],
    ['delay', number(options.delay)],
    ['timeout', number(options.timeout)],
    ['xScope', options.xScope],
    ['maxPosts', number(options.maxPosts)],
    ['transport', options.transport],
  ]
  for (const [key, value] of entries) {
    if (value !== undefined && value !== '') Object.assign(compact, { [key]: value })
  }
  return compact
}

/** Settings a new target gets from the composer, per URL: X profiles widen their scope. */
export function targetInputFor(url: string, settings: Omit<CrawlTargetInput, 'url' | 'name'>): CrawlTargetInput {
  const options = compactCrawlOptions(settings.options)
  if (crawlsX({ url, mode: settings.mode }) && !isXStatusUrl(url) && !options.xScope) options.xScope = 'visible'
  return { ...settings, url, name: '', options, enabled: settings.intervalMinutes > 0 }
}

function ownerFilter(): string {
  return `owner="${quoteFilter(requireSession().record.id)}"`
}

function normalizeTarget(row: CrawlTarget): CrawlTarget {
  return { ...row, options: row.options ?? {} }
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

// Targets ---------------------------------------------------------------------------------------

export function listCrawlTargets(page: number, signal?: AbortSignal) {
  return listOwnedCollection<CrawlTarget>(CRAWL_TARGETS, { page, perPage: TARGET_PAGE_SIZE, sort: '-created,-id', filter: ownerFilter() }, normalizeTarget, signal)
}

export async function createCrawlTarget(id: string, input: CrawlTargetInput): Promise<CrawlTarget> {
  return normalizeTarget(await createOnce<CrawlTarget>(CRAWL_TARGETS, id, { owner: requireSession().record.id, ...input }))
}

export async function updateCrawlTarget(target: Pick<CrawlTarget, 'id' | 'owner'>, patch: Partial<CrawlTargetInput>): Promise<CrawlTarget> {
  assertOwner(target)
  const data = patch.options ? { ...patch, options: compactCrawlOptions(patch.options) } : patch
  const row = await request<CrawlTarget>(`/api/collections/${CRAWL_TARGETS}/records/${encodeURIComponent(target.id)}`, { method: 'PATCH', data })
  return normalizeTarget(assertOwner(row))
}

/** Stored contents stay; they lose only their link to the target. */
export async function deleteCrawlTarget(target: Pick<CrawlTarget, 'id' | 'owner'>): Promise<void> {
  assertOwner(target)
  await request(`/api/collections/${CRAWL_TARGETS}/records/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
}

// Runs ------------------------------------------------------------------------------------------

export function isCrawlRunActive(run: Pick<CrawlRun, 'id' | 'status'>): boolean {
  return webCrawlKind.describe(run).active
}

/** Targets that are in a run right now; a target is crawled by one run at a time. */
export function busyTargetIds(runs: readonly Pick<CrawlRun, 'id' | 'status' | 'targets'>[]): Set<string> {
  return new Set(runs.filter(isCrawlRunActive).flatMap((run) => run.targets))
}

export function crawlRunUrl(run: Pick<CrawlRun, 'githubRunId'>): string | undefined {
  return /^\d+$/u.test(run.githubRunId) ? `${CRAWLER_RUNS_URL}/${run.githubRunId}` : undefined
}

export async function listActiveCrawlRuns(signal?: AbortSignal): Promise<CrawlRun[]> {
  const active = ACTIVE_STATUSES.map((status) => `status="${status}"`).join(' || ')
  const { items } = await listOwnedCollection<CrawlRun>(RUNS, {
    page: 1, perPage: 50, skipTotal: true, sort: '-created,-id', filter: `${ownerFilter()} && (${active})`,
  }, (row) => row, signal)
  return items
}

export function listCrawlRuns(page: number, signal?: AbortSignal) {
  return listOwnedCollection<CrawlRun>(RUNS, { page, perPage: RUN_PAGE_SIZE, sort: '-created,-id', filter: ownerFilter() }, (row) => row, signal)
}

/** Runs of one target, newest first. */
export async function listTargetRuns(targetId: string, signal?: AbortSignal): Promise<CrawlRun[]> {
  const { items } = await listOwnedCollection<CrawlRun>(RUNS, {
    page: 1, perPage: 10, skipTotal: true, sort: '-created,-id', filter: `${ownerFilter()} && targets ?= "${quoteFilter(targetId)}"`,
  }, (row) => row, signal)
  return items
}

/** Starts one run of up to 10 targets; callers split larger selections. */
export function startCrawl(id: string, targetIds: string[]): Promise<CrawlRun> {
  if (targetIds.length < 1 || targetIds.length > MAX_TARGETS_PER_RUN) throw new ApiError(`一次最多抓取 ${MAX_TARGETS_PER_RUN} 个页面`, 400, 'TOO_MANY_TARGETS')
  return createOnce<CrawlRun>(RUNS, id, { owner: requireSession().record.id, targets: targetIds })
}

/** Queued runs stop at once; a dispatched one is canceled on GitHub by the scheduler. */
export async function cancelCrawlRun(run: Pick<CrawlRun, 'id' | 'owner' | 'status'>): Promise<void> {
  assertOwner(run)
  if (!isCrawlRunActive(run)) throw new ApiError('抓取已经结束', 409, 'RUN_TERMINAL')
  await request(`/api/anyworkflow/crawl/runs/${encodeURIComponent(run.id)}/cancel`, { method: 'POST' })
}

export async function deleteCrawlRun(run: Pick<CrawlRun, 'id' | 'owner' | 'status'>): Promise<void> {
  assertOwner(run)
  if (isCrawlRunActive(run)) throw new ApiError('抓取还没有结束', 409, 'RUN_ACTIVE')
  await request(`/api/collections/${RUNS}/records/${encodeURIComponent(run.id)}`, { method: 'DELETE' })
}

// Contents --------------------------------------------------------------------------------------

export interface ContentQuery {
  page: number
  target?: string
  type?: string
  search?: string
}

export function listCrawledContents(query: ContentQuery, signal?: AbortSignal) {
  const filters = [ownerFilter()]
  if (query.target) filters.push(`target="${quoteFilter(query.target)}"`)
  if (query.type) filters.push(`type="${quoteFilter(query.type)}"`)
  const search = query.search?.trim()
  if (search) {
    const term = quoteFilter(search)
    filters.push(`(title~"${term}" || content~"${term}" || author~"${term}" || handle~"${term}")`)
  }
  return listOwnedCollection<CrawledContent>(CONTENTS, {
    page: query.page, perPage: CONTENT_PAGE_SIZE, sort: '-fetchedAt,-id', fields: CONTENT_LIST_FIELDS, filter: filters.join(' && '),
  }, (row) => row, signal)
}

export async function getCrawledContent(id: string, signal?: AbortSignal): Promise<CrawledContent> {
  return assertOwner(await request<CrawledContent>(`/api/collections/${CONTENTS}/records/${encodeURIComponent(id)}`, { signal }))
}

export async function deleteCrawledContent(content: Pick<CrawledContent, 'id' | 'owner'>): Promise<void> {
  assertOwner(content)
  await request(`/api/collections/${CONTENTS}/records/${encodeURIComponent(content.id)}`, { method: 'DELETE' })
}

