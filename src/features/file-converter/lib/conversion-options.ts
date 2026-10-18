import { ApiError } from '@/lib/api/client'
import type { PdfConversionOptions } from '@/lib/api/file-conversion'

/** Integer options edited as free text, with the inclusive range the backend accepts. */
export const numberFields = [
  ['images_per_request', '每次请求页数', 1, 20],
  ['concurrency', '并发请求数', 1, 100],
  ['dpi', '图像 DPI', 72, 300],
  ['jpeg_quality', 'JPEG 质量', 50, 100],
  ['verification_passes', '额外审校次数', 0, 3],
  ['rpm_per_key', '每 Key 每分钟请求数', 1, 1000],
  ['rpd_per_key', '每 Key 每日请求上限', 1, 100000],
  ['max_output_tokens', '输出 Token 上限（0 为自动）', 0, 200000],
] as const

export type NumericOptionKey = (typeof numberFields)[number][0]
export type NumericDraft = Record<NumericOptionKey, string>

/** Enumerated options; `provider` decides which reasoning control applies. */
export const choiceFields = [
  ['thinking_level', '思考深度', ['high', 'medium', 'low', 'minimal']],
  ['reasoning_effort', 'ModelFlare 推理强度', ['', 'minimal', 'low', 'medium', 'high', 'xhigh']],
  ['image_format', '图像格式', ['png', 'jpeg']],
  ['media_resolution', '视觉分辨率', ['ultra_high', 'high', 'medium', 'low', 'unspecified']],
] as const

export type ChoiceOptionKey = (typeof choiceFields)[number][0]

export function choiceAppliesTo(key: ChoiceOptionKey, provider: PdfConversionOptions['provider']): boolean {
  if (key === 'reasoning_effort') return provider === 'modelflare'
  if (key === 'thinking_level') return provider === 'gemini'
  return true
}

export const MODELFLARE_DEFAULT_MODEL = 'gpt-6-sol'

export function numberDrafts(options: PdfConversionOptions): NumericDraft {
  return Object.fromEntries(numberFields.map(([key]) => [key, String(options[key])])) as NumericDraft
}

export function parseNumberDraft(key: NumericOptionKey, raw: string): { value: number } | { error: string } {
  const field = numberFields.find(([fieldKey]) => fieldKey === key)
  if (!field) return { error: '转换配置字段无效，请刷新重试' }
  const [, label, minimum, maximum] = field
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
