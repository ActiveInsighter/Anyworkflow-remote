import type { ModelSurface, ReasoningEffort } from '@/lib/domain/runtime-config'

export interface CatalogModel {
  /** Display name; the extension matches it against the page's visible name or stable id. */
  name: string
  /** Efforts the site's picker actually offers for this model; empty means no effort control. */
  efforts: readonly ReasoningEffort[]
}

const FULL_RANGE: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const NO_XHIGH: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'max']

/**
 * What each site's model picker really lets a user choose, observed on the live pages (2026-10-18).
 * Claude's credit-gated Fable models are left out: choosing them does nothing without credits.
 * Update this list when a picker changes; the extension still verifies every selection before a send.
 */
export const MODEL_CATALOG: Record<ModelSurface, readonly CatalogModel[]> = {
  chatgpt: [
    { name: 'GPT-6', efforts: ['none', 'medium', 'high'] },
    { name: 'GPT-5.6 Sol', efforts: ['none', 'medium', 'high'] },
  ],
  // The Codex cloud picker is not adapted yet: its models are unknown, so none can be chosen.
  chatgptCloud: [],
  claude: [
    { name: 'Opus 5.5', efforts: FULL_RANGE },
    { name: 'Sonnet 5.5', efforts: FULL_RANGE },
    { name: 'Haiku 5.5', efforts: FULL_RANGE },
    { name: 'Opus 5', efforts: FULL_RANGE },
    { name: 'Sonnet 5', efforts: FULL_RANGE },
    { name: 'Opus 4.8', efforts: FULL_RANGE },
    { name: 'Opus 4.7', efforts: FULL_RANGE },
    { name: 'Opus 4.6', efforts: NO_XHIGH },
    { name: 'Sonnet 4.6', efforts: NO_XHIGH },
    { name: 'Haiku 4.5', efforts: [] },
  ],
}

export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: '无',
  minimal: '最低',
  low: '低',
  medium: '中等',
  high: '高',
  xhigh: '超高',
  max: '最高',
  standard: '标准',
  extended: '扩展',
  heavy: '深度',
}

/** Same loose comparison the extension uses, so "claude-sonnet-5-5" and "Sonnet 5.5" are one model. */
const nameKey = (value: string) => value.toLowerCase().replace(/^claude[\s-]*/u, '').replace(/[\s._-]+/gu, '')

export function findCatalogModel(site: ModelSurface, value: string | null): CatalogModel | null {
  if (!value) return null
  const key = nameKey(value)
  return MODEL_CATALOG[site].find((model) => nameKey(model.name) === key) ?? null
}
