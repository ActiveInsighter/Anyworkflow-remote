import { compactCrawlOptions } from '@/lib/api/crawl'
import type { CrawlOptions, CrawlRunner } from '@/types/crawl'

/** Crawl options as form fields hold them: text until submitted, empty meaning "the default". */
export interface OptionDraft {
  waitFor: string
  contentSelector: string
  /** One selector per line. */
  removeSelectors: string
  timeoutSeconds: string
  scroll: boolean
  keepHtml: boolean
  generic: boolean
  scope: '' | 'target' | 'visible'
  maxItems: string
  transport: '' | 'auto' | 'http' | 'browser'
}

export const EMPTY_OPTION_DRAFT: OptionDraft = {
  waitFor: '', contentSelector: '', removeSelectors: '', timeoutSeconds: '', scroll: false, keepHtml: false, generic: false, scope: '', maxItems: '', transport: '',
}

/** The same bounds PocketBase enforces (crawl_validation.js), so mistakes show where they are made. */
export const TIMEOUT_RANGE = { min: 10, max: 280 } as const
export const MAX_ITEMS_RANGE = { min: 1, max: 50 } as const

export function draftFromOptions(options: CrawlOptions | null | undefined): OptionDraft {
  const value = options ?? {}
  return {
    waitFor: value.waitFor ?? '',
    contentSelector: value.contentSelector ?? '',
    removeSelectors: (value.removeSelectors ?? []).join('\n'),
    timeoutSeconds: value.timeoutSeconds ? String(value.timeoutSeconds) : '',
    scroll: value.scroll === true,
    keepHtml: value.keepHtml === true,
    generic: value.generic === true,
    scope: value.scope ?? '',
    maxItems: value.maxItems ? String(value.maxItems) : '',
    transport: value.transport ?? '',
  }
}

export function optionsFromDraft(draft: OptionDraft, runner: CrawlRunner): CrawlOptions {
  const number = (value: string) => (value.trim() === '' ? undefined : Number(value))
  return compactCrawlOptions({
    waitFor: draft.waitFor,
    contentSelector: draft.contentSelector,
    removeSelectors: draft.removeSelectors.split('\n'),
    timeoutSeconds: number(draft.timeoutSeconds),
    scroll: draft.scroll,
    keepHtml: draft.keepHtml,
    generic: draft.generic,
    scope: draft.scope || undefined,
    maxItems: number(draft.maxItems),
    transport: draft.transport || undefined,
  }, runner)
}

/** How many options differ from the defaults for this runner; the fold shows it. */
export function countSetOptions(draft: OptionDraft, runner: CrawlRunner): number {
  return Object.keys(optionsFromDraft(draft, runner)).length
}

export function draftErrors(draft: OptionDraft, runner: CrawlRunner): Partial<Record<keyof OptionDraft, string>> {
  const errors: Partial<Record<keyof OptionDraft, string>> = {}
  const range = (key: 'timeoutSeconds' | 'maxItems', { min, max }: { min: number; max: number }) => {
    const raw = draft[key].trim()
    if (!raw) return
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) errors[key] = `填写 ${min}–${max} 的整数`
  }
  range('timeoutSeconds', TIMEOUT_RANGE)
  if (draft.scope === 'visible') range('maxItems', MAX_ITEMS_RANGE)
  const lines = draft.removeSelectors.split('\n').filter((line) => line.trim())
  if (lines.length > 20) errors.removeSelectors = '最多 20 个选择器'
  if (lines.some((line) => line.length > 500)) errors.removeSelectors = '选择器过长'
  if (runner === 'cloud' && draft.transport === 'http') {
    // A static read runs no page script, so there is nothing to wait for or scroll.
    if (draft.waitFor.trim()) errors.waitFor = '等待元素需要浏览器读取'
    if (draft.scroll) errors.scroll = '滚动加载需要浏览器读取'
  }
  return errors
}
