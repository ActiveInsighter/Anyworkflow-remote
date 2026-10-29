/**
 * Start links: the user's shortcuts for a Task's `start_url`. They feed the editor's start-page
 * picker and completion, and the default-start-link choice in runtime settings.
 *
 * Stored per account (see `lib/api/user-preferences.ts`). Stored data is read leniently: one bad
 * entry is dropped rather than discarding the whole list, because the list is the user's own
 * convenience data and never reaches the executor except as text they insert themselves.
 */
import { isStartUrl } from './runtime-config.ts'
import { RUNTIME_PAGES } from './runtime-pages.ts'

export interface StartLink {
  id: string
  label: string
  url: string
}

export const START_LINK_LIMITS = Object.freeze({ maxLinks: 30, maxLabel: 40 })

/** Used until the account saves its own list, and by "恢复默认". */
export const DEFAULT_START_LINKS: readonly StartLink[] = Object.freeze(
  RUNTIME_PAGES.map(({ id, label, url }) => Object.freeze({ id, label, url })),
)

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/u

export function createStartLinkId(): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/gu, '') ?? Math.random().toString(36).slice(2)
  return `l${random.slice(0, 15)}`
}

/** Collapses whitespace; labels are single-line UI text. */
export function cleanStartLinkLabel(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

export interface StartLinkErrors {
  label?: string
  url?: string
}

/** Field errors for one link being added or edited, checked against the rest of the list. */
export function validateStartLink(
  draft: { label: string; url: string },
  others: readonly StartLink[],
): StartLinkErrors {
  const errors: StartLinkErrors = {}
  const label = cleanStartLinkLabel(draft.label)
  const url = draft.url.trim()
  if (!label) errors.label = '请填写名称'
  else if ([...label].length > START_LINK_LIMITS.maxLabel) errors.label = `名称最多 ${START_LINK_LIMITS.maxLabel} 个字`
  if (!url) errors.url = '请填写链接'
  else if (!isStartUrl(url)) errors.url = '请填写以 https:// 开头的完整链接'
  else if (others.some((link) => link.url === url)) errors.url = '这个链接已经在列表中'
  return errors
}

export const hasStartLinkErrors = (errors: StartLinkErrors) => Boolean(errors.label || errors.url)

/**
 * Reads a stored list. Returns null when nothing usable was stored (callers fall back to the
 * defaults); otherwise every valid, distinct link in order, capped at the limit.
 */
export function normalizeStartLinks(value: unknown): StartLink[] | null {
  if (!Array.isArray(value)) return null
  const links: StartLink[] = []
  const ids = new Set<string>()
  const urls = new Set<string>()
  for (const item of value) {
    if (links.length >= START_LINK_LIMITS.maxLinks) break
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    if (typeof raw.label !== 'string' || typeof raw.url !== 'string') continue
    const label = cleanStartLinkLabel(raw.label)
    const url = raw.url.trim()
    if (!label || [...label].length > START_LINK_LIMITS.maxLabel || !isStartUrl(url) || urls.has(url)) continue
    let id = typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : createStartLinkId()
    while (ids.has(id)) id = createStartLinkId()
    ids.add(id)
    urls.add(url)
    links.push({ id, label, url })
  }
  return links
}

/** Same ids, labels and URLs in the same order. */
export function sameStartLinks(a: readonly StartLink[], b: readonly StartLink[]): boolean {
  return a.length === b.length && a.every((link, index) => {
    const other = b[index]
    return link.id === other.id && link.label === other.label && link.url === other.url
  })
}

/** Short host + path for compact UI, e.g. `chatgpt.com/images`. */
export function displayStartUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/u, '')
    return `${parsed.host}${path}${parsed.search}`
  } catch {
    return url
  }
}
