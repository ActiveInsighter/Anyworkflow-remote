import { ApiError } from '@/lib/api/client'
import type { PdfConversionOptions } from '@/lib/api/file-conversion'

/**
 * Integer options edited as free text, with the inclusive range the backend accepts.
 * `images_per_request` is deprecated (one page per request) and kept only in stored data.
 */
export const numberFields = [
  ['concurrency', '并发请求数', 1, 100],
  ['dpi', '渲染 DPI', 72, 300],
  ['jpeg_quality', 'JPEG 质量', 50, 100],
  ['verification_passes', '额外审校次数', 0, 3],
  ['rpm_per_key', '每 Key 每分钟请求', 1, 1000],
  ['rpd_per_key', '每 Key 单次任务请求上限', 1, 100000],
  ['max_output_tokens', '输出 Token 上限', 0, 200000],
] as const

export type NumericOptionKey = (typeof numberFields)[number][0]
export type NumericDraft = Record<NumericOptionKey, string>

/** Enumerated options; `provider` decides which reasoning control applies. */
export const choiceFields = [
  ['thinking_level', '思考深度', ['high', 'medium', 'low', 'minimal']],
  ['reasoning_effort', '推理强度', ['', 'minimal', 'low', 'medium', 'high', 'xhigh']],
  ['image_format', '图像格式', ['png', 'jpeg']],
  ['media_resolution', '视觉分辨率', ['ultra_high', 'high', 'medium', 'low', 'unspecified']],
] as const

export type ChoiceOptionKey = (typeof choiceFields)[number][0]

const choiceValueLabels: Record<string, string> = {
  '': '自动',
  xhigh: '极高',
  ultra_high: '超高',
  high: '高',
  medium: '中',
  low: '低',
  minimal: '最低',
  unspecified: '不指定',
  png: 'PNG（无损）',
  jpeg: 'JPEG',
}

export function choiceValueLabel(value: string): string {
  return choiceValueLabels[value] ?? value
}

/** How the configuration sheet groups the saved options. */
export const optionGroups: { title: string; numbers: NumericOptionKey[]; choices: ChoiceOptionKey[] }[] = [
  { title: '模型', numbers: ['verification_passes', 'max_output_tokens'], choices: ['thinking_level', 'reasoning_effort'] },
  { title: '页面图像', numbers: ['dpi', 'jpeg_quality'], choices: ['image_format', 'media_resolution'] },
  { title: '吞吐与配额', numbers: ['concurrency', 'rpm_per_key', 'rpd_per_key'], choices: [] },
]

export function numberField(key: NumericOptionKey) {
  const field = numberFields.find(([fieldKey]) => fieldKey === key)
  if (!field) throw Error(`Unknown option ${key}`)
  return field
}

export function choiceField(key: ChoiceOptionKey) {
  const field = choiceFields.find(([fieldKey]) => fieldKey === key)
  if (!field) throw Error(`Unknown option ${key}`)
  return field
}

export function choiceAppliesTo(key: ChoiceOptionKey, provider: PdfConversionOptions['provider']): boolean {
  if (key === 'reasoning_effort') return provider === 'modelflare'
  if (key === 'thinking_level') return provider === 'gemini'
  return true
}

/** Readable label and value for one entry of a job's parameter snapshot. */
export function describeJobOption(key: string, value: unknown): { label: string; value: string } | null {
  if (key === 'images_per_request' || key === 'start_page' || key === 'end_page') return null
  const labels: Record<string, string> = {
    provider: '模型接口',
    model: '模型',
    adjacent_pages: '附带相邻页',
    ...Object.fromEntries(numberFields.map(([fieldKey, label]) => [fieldKey, label])),
    ...Object.fromEntries(choiceFields.map(([fieldKey, label]) => [fieldKey, label])),
  }
  const label = labels[key] ?? key
  if (typeof value === 'boolean') return { label, value: value ? '是' : '否' }
  if (key === 'provider') return { label, value: value === 'modelflare' ? 'ModelFlare' : 'Gemini' }
  if (key === 'max_output_tokens' && value === 0) return { label, value: '自动' }
  if (choiceFields.some(([fieldKey]) => fieldKey === key)) return { label, value: choiceValueLabel(String(value)) }
  return { label, value: String(value) }
}

export const MODELFLARE_DEFAULT_MODEL = 'gpt-6-sol'

export function numberDrafts(options: PdfConversionOptions): NumericDraft {
  return Object.fromEntries(numberFields.map(([key]) => [key, String(options[key])])) as NumericDraft
}

export function parseNumberDraft(key: NumericOptionKey, raw: string): { value: number } | { error: string } {
  const [, label, minimum, maximum] = numberField(key)
  const value = Number(raw.trim())
  if (!raw.trim() || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return { error: `${label}需填写 ${minimum}–${maximum} 的整数` }
  }
  return { value }
}

/** Applies every numeric draft, or reports the first invalid field. */
export function readDraftOptions(
  options: PdfConversionOptions,
  drafts: NumericDraft,
): { value: PdfConversionOptions } | { error: string } {
  const next = { ...options }
  for (const [key] of numberFields) {
    const parsed = parseNumberDraft(key, drafts[key])
    if ('error' in parsed) return parsed
    next[key] = parsed.value
  }
  return { value: next }
}

export function configErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 404) {
    return '后端转换配置表尚未部署，请先应用 migration 1790514100_file_conversion_configs。'
  }
  return cause instanceof Error ? cause.message : '配置加载失败，请刷新重试'
}
