/**
 * Web crawling, one model for both executors. The crawler (webpage-parser-action) and the
 * AnyWorkflow-workers hooks (`crawl_validation.js`) agree on these names and bounds.
 */

/** Where a crawl runs: GitHub Actions without a login, or the owner's own browser extension. */
export type CrawlRunner = 'cloud' | 'browser'

/** Per-request overrides. PocketBase stores exactly these keys and drops empty ones. */
export interface CrawlOptions {
  waitFor?: string
  contentSelector?: string
  removeSelectors?: string[]
  scroll?: boolean
  keepHtml?: boolean
  generic?: boolean
  timeoutSeconds?: number
  /** `visible` reads every entry on the page (an X profile); `target` only the linked one. */
  scope?: 'target' | 'visible'
  maxItems?: number
  /** Cloud only: read the static HTML, a live browser, or HTTP first with a browser fallback. */
  transport?: 'auto' | 'http' | 'browser'
}

/** What an owner edits on a saved page. */
export interface CrawlTargetInput {
  url: string
  name: string
  runner: CrawlRunner
  category: string
  options: CrawlOptions
  intervalMinutes: number
  enabled: boolean
}

export type CrawlOutcome = 'succeeded' | 'partial' | 'failed' | 'canceled'

/** A saved page (`aw_crawl_targets`): its settings, schedule and how it last went. */
export interface CrawlTarget extends CrawlTargetInput {
  id: string
  owner: string
  host: string
  nextRunAt: string
  lastJob: string
  lastRunAt: string
  lastStatus: '' | CrawlOutcome
  lastErrorCode: string
  lastError: string
  lastDocument: string
  title: string
  created: string
  updated: string
}

/** One crawl of one URL (`aw_crawl_jobs`, task kind `crawl`): a request snapshot, its lifecycle and a summary. */
export interface CrawlJob {
  id: string
  owner: string
  target: string
  url: string
  host: string
  runner: CrawlRunner
  category: string
  options: CrawlOptions | null
  trigger: 'manual' | 'schedule'
  rerunOf: string
  status: string
  cancelRequested: boolean
  attempts: number
  nextAttemptAt: string
  errorCode: string
  error: string
  startedAt: string
  finishedAt: string
  title: string
  siteName: string
  extractor: string
  profile: string
  wordCount: number
  qualityScore: number
  itemCount: number
  document: string
  changed: boolean
  created: string
  updated: string
}

export interface CrawlLink {
  href: string
  text: string
}

export interface CrawlImage {
  src: string
  alt: string
}

/** A structured entry a site profile read, such as one X post. Fields vary by profile. */
export interface CrawlItem {
  id?: string
  url?: string
  author?: string
  handle?: string | null
  text?: string
  postedAt?: string | null
  images?: string[]
  metrics?: Record<string, number>
  relation?: 'target' | 'visible'
  [key: string]: unknown
}

/**
 * The latest content of one page or post (`aw_crawl_documents`), one per owner and content
 * identity. Lists load a short excerpt in `markdown`; the full record loads when opened.
 */
export interface CrawlDocument {
  id: string
  owner: string
  identity: string
  target: string
  job: string
  runner: CrawlRunner
  category: string
  url: string
  canonicalUrl: string
  host: string
  httpStatus: number
  title: string
  byline: string
  siteName: string
  language: string
  description: string
  publishedAt: string
  leadImage: string
  markdown: string
  html: string
  wordCount: number
  items: CrawlItem[] | null
  links: CrawlLink[] | null
  images: CrawlImage[] | null
  structuredData: unknown[] | null
  extras: Record<string, unknown> | null
  extractor: string
  profile: string
  qualityScore: number
  warnings: string[] | null
  trace: { phases?: Record<string, number>; steps?: string[]; route?: string; runner?: CrawlRunner } | null
  crawlerVersion: string
  contentHash: string
  fetchedAt: string
  changedAt: string
  created: string
  updated: string
}

/** One browser extension reporting in (`aw_crawl_workers`). */
export interface CrawlWorker {
  id: string
  owner: string
  workerId: string
  label: string
  version: string
  lastSeenAt: string
}
