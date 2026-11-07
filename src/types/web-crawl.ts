/** Per-target crawl options. PocketBase (`crawl_validation.js`) and the crawler accept exactly these keys. */
export interface CrawlOptions {
  selector?: string
  attribute?: string
  waitFor?: string
  delay?: number
  timeout?: number
  xScope?: 'target' | 'visible'
  maxPosts?: number
  transport?: 'auto' | 'http' | 'browser'
}

export type CrawlMode = 'auto' | 'page' | 'x'

/** What an owner edits on a target. */
export interface CrawlTargetInput {
  url: string
  name: string
  mode: CrawlMode
  contentType: string
  options: CrawlOptions
  intervalMinutes: number
  enabled: boolean
}

/** A page kept for crawling (`aw_crawl_targets`): settings, schedule and its latest outcome. */
export interface CrawlTarget extends CrawlTargetInput {
  id: string
  owner: string
  host: string
  options: CrawlOptions
  nextRunAt: string
  lastRunAt: string
  lastRun: string
  lastStatus: '' | 'succeeded' | 'failed'
  lastError: string
  lastErrorCode: string
  lastItemCount: number
  pageTitle: string
  created: string
  updated: string
}

/** A target as a run snapshotted it. */
export interface CrawlRunItem {
  target: string
  url: string
  name: string
  mode: CrawlMode
  contentType: string
  options: CrawlOptions
}

export interface CrawlRunResult {
  status: 'succeeded' | 'failed' | 'canceled'
  itemCount: number
  recordIds: string[]
  title?: string
  error: string
  errorCode: string
  transport?: string
  reportedAt?: string
}

/** One workflow run over up to 10 targets (`aw_crawl_runs`, task kind `web-crawl`). */
export interface CrawlRun {
  id: string
  owner: string
  targets: string[]
  trigger: 'manual' | 'schedule'
  items: CrawlRunItem[] | null
  results: Record<string, CrawlRunResult> | null
  status: string
  cancelRequested: boolean
  targetCount: number
  reportedCount: number
  succeededCount: number
  itemCount: number
  githubRunId: string
  conclusion: string
  dispatchStartedAt: string
  startedAt: string
  finishedAt: string
  error: string
  created: string
  updated: string
}

export interface CrawledMedia {
  images?: string[]
  videos?: { url?: string | null; poster?: string | null; sources?: string[] }[]
}

/** A stored crawl result (`aw_crawled_contents`), one per owner and content identity. */
export interface CrawledContent {
  id: string
  owner: string
  target: string
  run: string
  type: string
  platform: 'x' | 'web'
  source: string
  canonicalUrl: string
  externalId: string
  title: string
  /** Full text when opened; lists load a short excerpt instead. */
  content: string
  author: string
  handle: string
  publishedAt: string
  fetchedAt: string
  changedAt: string
  media: CrawledMedia | null
  metrics: Record<string, number> | null
  metadata: Record<string, unknown> | null
  created: string
  updated: string
}
