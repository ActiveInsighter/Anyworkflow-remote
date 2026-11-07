import { compactCrawlOptions } from '@/lib/api/web-crawl'
import type { CrawlMode, CrawlOptions, CrawlTarget } from '@/types/web-crawl'

/** Crawl options as form fields hold them: text until submitted, empty meaning "default". */
export interface OptionDraft {
  mode: CrawlMode
  selector: string
  attribute: string
  waitFor: string
  delay: string
  timeout: string
  xScope: '' | 'target' | 'visible'
  maxPosts: string
  transport: '' | 'auto' | 'http' | 'browser'
}

export const EMPTY_OPTION_DRAFT: OptionDraft = {
  mode: 'auto', selector: '', attribute: '', waitFor: '', delay: '', timeout: '', xScope: '', maxPosts: '', transport: '',
}

export function draftFromTarget(target: Pick<CrawlTarget, 'mode' | 'options'>): OptionDraft {
  const options = target.options ?? {}
  const text = (value: number | undefined) => (value === undefined ? '' : String(value))
  return {
    mode: target.mode,
    selector: options.selector ?? '',
    attribute: options.attribute ?? '',
    waitFor: options.waitFor ?? '',
    delay: text(options.delay),
    timeout: text(options.timeout),
    xScope: options.xScope ?? '',
    maxPosts: text(options.maxPosts),
    transport: options.transport ?? '',
  }
}

export function optionsFromDraft(draft: OptionDraft): { mode: CrawlMode; options: CrawlOptions } {
  const number = (value: string) => (value.trim() === '' ? undefined : Number(value))
  return {
    mode: draft.mode,
    options: compactCrawlOptions({
      selector: draft.selector,
      attribute: draft.attribute,
      waitFor: draft.waitFor,
      delay: number(draft.delay),
      timeout: number(draft.timeout),
      xScope: draft.xScope || undefined,
      maxPosts: draft.xScope === 'visible' ? number(draft.maxPosts) : undefined,
      transport: draft.transport || undefined,
    }),
  }
}

/** How many options differ from the defaults; the fold shows it. */
export function countSetOptions(draft: OptionDraft): number {
  const { mode, options } = optionsFromDraft(draft)
  return Object.keys(options).length + (mode === 'auto' ? 0 : 1)
}

/** Field-level checks, the same bounds PocketBase enforces, so mistakes show where they are made. */
export function draftErrors(draft: OptionDraft): Partial<Record<keyof OptionDraft, string>> {
  const errors: Partial<Record<keyof OptionDraft, string>> = {}
  const range = (key: 'delay' | 'timeout' | 'maxPosts', min: number, max: number, integer = false, minExclusive = false) => {
    const raw = draft[key].trim()
    if (!raw) return
    const value = Number(raw)
    const low = minExclusive ? value > min : value >= min
    if (!Number.isFinite(value) || !low || value > max || (integer && !Number.isInteger(value))) {
      errors[key] = minExclusive ? `填写 ${min} 以上、不超过 ${max} 的数` : `填写 ${min}–${max}${integer ? ' 的整数' : ''}`
    }
  }
  range('delay', 0, 30)
  range('timeout', 0, 120, false, true)
  if (draft.xScope === 'visible') range('maxPosts', 1, 50, true)
  if (draft.attribute.trim() && !/^[A-Za-z_:][-A-Za-z0-9_:.]{0,99}$/u.test(draft.attribute.trim())) errors.attribute = '属性名无效'
  if (draft.transport === 'http' && draft.waitFor.trim()) errors.waitFor = '等待元素需要浏览器抓取'
  return errors
}
