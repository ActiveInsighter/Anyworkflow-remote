import { safeFilename } from '@/lib/platform/download'
import type { CaptureJob, CaptureResult } from '@/types/page-capture'

const WARNING_LABELS: Record<string, string> = {
  load_timeout: '页面加载超时，已按当前内容解析',
  short_content: '正文较短',
  link_heavy: '链接占比偏高，可能混入导航',
  no_title: '没有识别到标题',
  truncated: '内容过长，已截断',
  site_profile_fell_back: '站点规则未命中，已改用通用解析',
  step_skipped: '部分页面操作已跳过',
  http_error: '服务器返回了错误状态',
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

export function jobTitle(job: Pick<CaptureJob, 'title' | 'url'>): string {
  return job.title || job.url
}

/** Captured links are untrusted, and React renders `javascript:` hrefs as they are. */
export function safeHref(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export function captureFilename(title: string): string {
  return safeFilename(title, '网页采集', 'md')
}

/** The saved file: Markdown with its provenance in front matter (JSON strings are valid YAML). */
export function captureDocument(result: CaptureResult): string {
  const fields: [string, string][] = [
    ['title', result.title],
    ['source', result.canonicalUrl || result.url],
    ['author', result.byline],
    ['site', result.siteName],
    ['published', result.publishedAt],
    ['captured', result.created],
  ]
  const lines = fields.filter(([, value]) => value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  return `---\n${lines.join('\n')}\n---\n\n${result.markdown}\n`
}

/** Long enough for any article; beyond it a phone would struggle and the download has it all. */
export const PREVIEW_CHARS = 200_000

export function markdownPreview(markdown: string): { text: string; clipped: boolean } {
  return markdown.length > PREVIEW_CHARS ? { text: markdown.slice(0, PREVIEW_CHARS), clipped: true } : { text: markdown, clipped: false }
}
