import { CRAWL_INTERVALS } from '@/lib/api/crawl'
import { formatDateTime, formatRelativeTime } from '@/lib/format'
import { safeFilename } from '@/lib/platform/download'
import type { CrawlDocument, CrawlItem, CrawlJob, CrawlRunner, CrawlTarget } from '@/types/crawl'

const BUILT_IN_CATEGORIES: Record<string, string> = { social_media: '社交媒体', webpage: '网页' }
export const BUILT_IN_CATEGORY_IDS = Object.keys(BUILT_IN_CATEGORIES)

export const RUNNER_LABELS: Record<CrawlRunner, string> = { cloud: '云端', browser: '浏览器' }

/** The crawler's stable error codes, as an owner would read them. */
const ERROR_TEXT: Record<string, string> = {
  URL_BLOCKED: '这个地址不允许抓取',
  NAVIGATION_FAILED: '页面打不开',
  HTTP_ERROR: '网站暂时不可用',
  NOT_FOUND: '页面不存在',
  LOGIN_REQUIRED: '页面需要登录',
  CAPTCHA: '网站要求人工验证',
  ACCESS_DENIED: '网站拒绝了访问',
  UNSUPPORTED_CONTENT: '不是网页内容，PDF 请用文件转换',
  EMPTY_CONTENT: '没有读到正文',
  TARGET_NOT_FOUND: '页面上找不到链接指向的内容，可能已删除',
  STEP_FAILED: '页面操作没有完成，比如等待的元素没有出现',
  TIMEOUT: '抓取超时',
  PAGE_GONE: '页面被关闭了',
  CANCELED: '已取消',
  INTERNAL: '抓取出错',
  LEASE_LOST: '执行中断',
}

/** Codes that a signed-in browser may get past; a cloud job that ends with one can move there. */
const NEEDS_LOGIN = new Set(['LOGIN_REQUIRED', 'ACCESS_DENIED', 'CAPTCHA'])

const WARNING_LABELS: Record<string, string> = {
  load_timeout: '页面加载超时，已按当前内容解析',
  short_content: '正文较短',
  link_heavy: '链接占比偏高，可能混入导航',
  no_title: '没有识别到标题',
  truncated: '内容过长，已截断',
  site_profile_fell_back: '站点规则未命中，已改用通用解析',
  step_skipped: '部分页面操作已跳过',
  http_error: '服务器返回了错误状态',
  route_fell_back: '静态读取没有内容，已改用浏览器',
}

const METRIC_LABELS: Record<string, string> = { replies: '回复', reposts: '转发', quotes: '引用', likes: '喜欢', bookmarks: '书签', views: '浏览' }

/**
 * Sites that show little or nothing without a login. A hint, not a rule: the cloud runner still
 * reads what they show anonymously.
 */
const LOGIN_HOSTS = [
  'weibo.com', 'weibo.cn', 'xiaohongshu.com', 'douyin.com', 'zhihu.com', 'instagram.com', 'facebook.com', 'linkedin.com',
  'threads.net', 'tiktok.com', 'bilibili.com', 'mp.weixin.qq.com', 'reddit.com',
]

function parse(value: string): number {
  return Date.parse(value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /u, '$1T'))
}

export function categoryLabel(category: string): string {
  return BUILT_IN_CATEGORIES[category] ?? category
}

export function intervalLabel(minutes: number): string {
  return CRAWL_INTERVALS.find((interval) => interval.minutes === minutes)?.label ?? `每 ${minutes} 分钟`
}

const SHORT_URL_CHARS = 72

/** A link as a name, before a crawl finds a title: no scheme, and a long path cut short. */
export function shortUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//iu, '').replace(/\/$/u, '')
  return bare.length > SHORT_URL_CHARS ? `${bare.slice(0, SHORT_URL_CHARS - 1)}…` : bare
}

export function targetTitle(target: Pick<CrawlTarget, 'name' | 'title' | 'url'>): string {
  return target.name || target.title || shortUrl(target.url)
}

export function jobTitle(job: Pick<CrawlJob, 'title' | 'url'>): string {
  return job.title || shortUrl(job.url)
}

export function documentTitle(document: Pick<CrawlDocument, 'title' | 'canonicalUrl' | 'url'>): string {
  return document.title || shortUrl(document.canonicalUrl || document.url)
}

/** "12 分钟后", "3 小时后", then the date: when the next scheduled crawl happens. */
export function formatUntil(value: string, now = Date.now()): string {
  const time = parse(value)
  if (Number.isNaN(time)) return value
  const minutes = Math.ceil((time - now) / 60_000)
  if (minutes <= 1) return '即将'
  if (minutes < 60) return `${minutes} 分钟后`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} 小时后`
  return formatDateTime(value)
}

/** The schedule as one fact: how often, and when next (or that it is paused). */
export function scheduleText(target: Pick<CrawlTarget, 'intervalMinutes' | 'enabled' | 'nextRunAt'>, now = Date.now()): string {
  if (target.intervalMinutes <= 0) return '仅手动'
  if (!target.enabled) return `${intervalLabel(target.intervalMinutes)} · 已暂停`
  return target.nextRunAt ? `${intervalLabel(target.intervalMinutes)} · ${formatUntil(target.nextRunAt, now)}` : intervalLabel(target.intervalMinutes)
}

/** A failure the console can explain, from its stable code; the reported text otherwise. */
export function crawlErrorText(code: string, runner: CrawlRunner, fallback = ''): string {
  if (code === 'NO_WORKER') return runner === 'browser' ? '浏览器扩展长时间不在线，任务已结束' : '云端长时间没有运行，任务已结束'
  if (code === 'LOGIN_REQUIRED' && runner === 'cloud') return '页面需要登录，可以改用浏览器抓取'
  return ERROR_TEXT[code] ?? (fallback || '抓取失败')
}

/** Whether a finished cloud job might succeed in the owner's signed-in browser. */
export function mayNeedLogin(job: Pick<CrawlJob, 'runner' | 'status' | 'errorCode'>): boolean {
  return job.runner === 'cloud' && job.status === 'failed' && NEEDS_LOGIN.has(job.errorCode)
}

/** Pasted links whose sites usually want a login. */
export function loginHosts(urls: readonly string[]): string[] {
  const hosts = new Set<string>()
  for (const url of urls) {
    const host = new URL(url).hostname.toLowerCase()
    const match = LOGIN_HOSTS.find((entry) => host === entry || host.endsWith(`.${entry}`))
    if (match) hosts.add(match)
  }
  return [...hosts]
}

export function lastOutcomeText(target: Pick<CrawlTarget, 'lastStatus' | 'lastRunAt'>, now = Date.now()): string {
  if (!target.lastRunAt) return '尚未抓取'
  const when = formatRelativeTime(target.lastRunAt, now)
  if (target.lastStatus === 'failed') return `${when}抓取失败`
  if (target.lastStatus === 'canceled') return `${when}已取消`
  if (target.lastStatus === 'partial') return `${when}抓取 · 内容不完整`
  return `${when}抓取`
}

export function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code
}

/** `site:zhihu`, `defuddle:site`, `manual`… as a person would say it. */
export function extractorLabel(extractor: string): string {
  const [kind, detail] = extractor.split(':')
  if (kind === 'site') return `站点规则 · ${detail}`
  if (kind === 'manual') return '手动选择器'
  if (kind === 'defuddle') return detail === 'site' ? '通用解析 · 站点适配' : '通用解析'
  if (kind === 'readability') return '通用解析（备用）'
  return extractor
}

/** Content seen again unchanged keeps its change time; a later one means the page changed. */
export function wasUpdated(document: Pick<CrawlDocument, 'created' | 'changedAt'>): boolean {
  return Boolean(document.changedAt) && parse(document.changedAt) - parse(document.created) > 60_000
}

/** Lists show two lines; the server sends 160 characters, and this bound keeps the regexes linear anyway. */
const EXCERPT_SOURCE_CHARS = 600

/** A list excerpt as plain words: markdown marks and link targets are noise in one or two lines. */
export function excerptText(text: string): string {
  return text
    .slice(0, EXCERPT_SOURCE_CHARS)
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gmu, '')
    .replace(/[*_`~]{1,3}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function metricEntries(metrics: Record<string, number> | undefined): { label: string; value: string }[] {
  return Object.entries(metrics ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => ({ label: METRIC_LABELS[key] ?? key, value: value.toLocaleString('zh-CN') }))
}

/** An X post's byline: "作者 @handle". */
export function itemByline(item: CrawlItem): string {
  return [item.author, item.handle].filter(Boolean).join(' ')
}

/** What a document sheet needs before the record loads. */
export function documentRef(document: Pick<CrawlDocument, 'id' | 'title' | 'canonicalUrl' | 'url'>): { id: string; title: string } {
  return { id: document.id, title: documentTitle(document) }
}

export function documentFilename(document: Pick<CrawlDocument, 'title'>): string {
  return safeFilename(document.title, '网页采集', 'md')
}

/** The saved file: Markdown with its provenance in front matter (JSON strings are valid YAML). */
export function documentMarkdown(document: CrawlDocument): string {
  const fields: [string, string][] = [
    ['title', document.title],
    ['source', document.canonicalUrl || document.url],
    ['author', document.byline],
    ['site', document.siteName],
    ['published', document.publishedAt],
    ['fetched', document.fetchedAt],
  ]
  const lines = fields.filter(([, value]) => value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  return `---\n${lines.join('\n')}\n---\n\n${document.markdown}\n`
}

/** Long enough for any article; beyond it a phone would struggle, and the download has it all. */
export const PREVIEW_CHARS = 200_000

export function markdownPreview(markdown: string): { text: string; clipped: boolean } {
  return markdown.length > PREVIEW_CHARS ? { text: markdown.slice(0, PREVIEW_CHARS), clipped: true } : { text: markdown, clipped: false }
}
