/** Per-job overrides. The extension and the `capture.js` hook accept exactly these keys. */
export interface CaptureOptions {
  waitFor?: string
  contentSelector?: string
  removeSelectors?: string[]
  scroll?: boolean
  keepHtml?: boolean
  timeoutSeconds?: number
  generic?: boolean
}

/** Lifecycle and summary of one requested URL (`aw_capture_jobs`). */
export interface CaptureJob {
  id: string
  owner: string
  url: string
  host: string
  options: CaptureOptions | null
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
  wordCount: number
  qualityScore: number
  created: string
  updated: string
}

export interface CaptureLink {
  href: string
  text: string
}

export interface CaptureImage {
  src: string
  alt: string
}

/** The captured content, 1:1 with a job (`aw_capture_results`). Fetched only when opened. */
export interface CaptureResult {
  id: string
  owner: string
  job: string
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
  contentHash: string
  wordCount: number
  links: CaptureLink[] | null
  images: CaptureImage[] | null
  structuredData: unknown[] | null
  extras: Record<string, unknown> | null
  extractor: string
  profile: string
  qualityScore: number
  warnings: string[] | null
  trace: { phases?: Record<string, number>; steps?: string[] } | null
  extensionVersion: string
  created: string
}

/** One extension install reporting in (`aw_capture_workers`). */
export interface CaptureWorker {
  id: string
  owner: string
  workerId: string
  label: string
  version: string
  lastSeenAt: string
}
