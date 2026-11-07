import { CRAWL_INTERVALS } from '@/lib/api/web-crawl'
import { formatDateTime, formatRelativeTime } from '@/lib/format'
import type { CrawledContent, CrawlRun, CrawlTarget } from '@/types/web-crawl'

const BUILT_IN_TYPES: Record<string, string> = { social_media: '社交媒体', webpage: '网页' }

const ERROR_TEXT: Record<string, string> = {
  target_not_found: '公开页面上找不到这条帖子，可能已删除或需要登录',
  status_url_required: '需要指向具体帖子的链接',
  no_posts: '页面上没有可见的公开帖子',
  no_match: '选择器没有匹配到内容',
  timeout: '抓取超时',
  invalid_options: '抓取选项无效',
  storage_failed: '抓取成功，但保存结果失败',
  crawl_failed: '页面加载失败',
  http_401: '页面需要登录（401）',
  http_403: '网站拒绝了匿名访问（403）',
  http_404: '页面不存在（404）',
  http_410: '页面已被删除（410）',
  http_429: '请求过于频繁，网站暂时限制了访问（429）',
}

const METRIC_LABELS: Record<string, string> = { replies: '回复', reposts: '转发', likes: '喜欢', bookmarks: '收藏', views: '浏览' }

function parse(value: string): number {
  return Date.parse(value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /u, '$1T'))
}

export function intervalLabel(minutes: number): string {
  return CRAWL_INTERVALS.find((interval) => interval.minutes === minutes)?.label ?? `每 ${minutes} 分钟`
}

/** `social_media` and `webpage` are the server's defaults; owners may type any category. */
export function contentTypeLabel(type: string): string {
  return BUILT_IN_TYPES[type] ?? type
}

export function targetTitle(target: Pick<CrawlTarget, 'name' | 'pageTitle' | 'url'>): string {
  return target.name || target.pageTitle || target.url
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

/** A failure the console can explain, from the crawler's stable code; the raw text otherwise. */
export function crawlErrorText(code: string, fallback = ''): string {
  if (ERROR_TEXT[code]) return ERROR_TEXT[code]
  const status = /^http_(\d{3})$/u.exec(code)?.[1]
  if (status) return Number(status) >= 500 ? `网站暂时不可用（${status}）` : `网站返回了错误（${status}）`
  return fallback || '抓取失败'
}

export function lastOutcomeText(target: Pick<CrawlTarget, 'lastStatus' | 'lastRunAt' | 'lastItemCount'>, now = Date.now()): string {
  if (!target.lastRunAt) return '尚未抓取'
  const when = formatRelativeTime(target.lastRunAt, now)
  return target.lastStatus === 'succeeded' ? `${when}抓取 · ${target.lastItemCount} 条` : `${when}抓取失败`
}

export function platformLabel(platform: CrawledContent['platform']): string {
  return platform === 'x' ? 'X' : '网页'
}

export function contentTitle(content: Pick<CrawledContent, 'title' | 'content' | 'author' | 'platform' | 'canonicalUrl'>): string {
  if (content.platform === 'x') return content.author ? `${content.author} 的帖子` : 'X 帖子'
  return content.title || content.content.split('\n').find((line) => line.trim())?.trim().slice(0, 80) || content.canonicalUrl
}

/** A list excerpt as plain words: markdown marks and link targets are noise in one or two lines. */
export function excerptText(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gmu, '')
    .replace(/[*_`~]{1,3}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Content seen again unchanged keeps its change time; a later change time means it was updated. */
export function wasUpdated(content: Pick<CrawledContent, 'created' | 'changedAt'>): boolean {
  return Boolean(content.changedAt) && parse(content.changedAt) - parse(content.created) > 60_000
}

export function metricEntries(metrics: Record<string, number> | null): { label: string; value: string }[] {
  return Object.entries(metrics ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => ({ label: METRIC_LABELS[key] ?? key, value: value.toLocaleString('zh-CN') }))
}

/** A run's name: its one page, or how many it covers. */
export function runTitle(run: Pick<CrawlRun, 'items' | 'targetCount'>): string {
  const items = run.items ?? []
  if (items.length === 1) {
    const [item] = items
    try {
      return item.name || new URL(item.url).hostname
    } catch {
      return item.name || item.url
    }
  }
  return `${run.targetCount || items.length} 个页面`
}

export function runOutcomeText(run: Pick<CrawlRun, 'reportedCount' | 'succeededCount' | 'targetCount' | 'itemCount'>): string {
  if (!run.reportedCount) return ''
  const failed = run.reportedCount - run.succeededCount
  const pages = run.targetCount > 1 ? `${run.succeededCount}/${run.targetCount} 个页面成功` : failed ? '' : '已抓取'
  return [pages, `${run.itemCount} 条内容`].filter(Boolean).join(' · ')
}

/** Captured text is untrusted; a filename built from it keeps only safe characters. */
export function contentFilename(content: Pick<CrawledContent, 'title' | 'externalId' | 'id'>): string {
  const base = (content.title || content.externalId || content.id).replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, ' ').trim().slice(0, 80)
  return `${base || content.id}.md`
}

export function contentDocument(content: CrawledContent): string {
  const facts = [
    `- 来源：${content.canonicalUrl || content.source}`,
    content.author ? `- 作者：${content.author}${content.handle ? `（${content.handle}）` : ''}` : '',
    content.publishedAt ? `- 发布时间：${formatDateTime(content.publishedAt)}` : '',
    `- 抓取时间：${formatDateTime(content.fetchedAt)}`,
  ].filter(Boolean)
  return `# ${contentTitle(content)}\n\n${facts.join('\n')}\n\n${content.content}\n`
}
