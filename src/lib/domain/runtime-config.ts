export const REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'standard',
  'extended',
  'heavy',
] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]
/**
 * A model-picker surface: pages whose picker has the same DOM and the same models. ChatGPT chat and
 * image pages are one surface, the Codex cloud page another; Claude chat and Code are one.
 */
export const MODEL_SURFACES = ['chatgpt', 'chatgptCloud', 'claude'] as const
export type ModelSurface = (typeof MODEL_SURFACES)[number]
export type ModelSite = ModelSurface
export interface SiteModelSelection {
  model: string | null
  reasoningEffort: ReasoningEffort | null
}
/** v2 carries `chatgpt` and `claude`; v3 adds `chatgptCloud`. */
export type ModelSelection = Partial<Record<ModelSurface, SiteModelSelection>>

/** Opened by a Task whose `start_url` is empty when the account sets no other default. */
export const DEFAULT_START_URL = 'https://chatgpt.com/'
// Same pattern as the backend contract (the PocketBase JS engine has no URL class).
const START_URL_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:[/?#][^\s<>"'`\\]*)?$/
export const isStartUrl = (value: string) => value.length <= 2048 && START_URL_PATTERN.test(value)

const SURFACES_BY_VERSION: Record<2 | 3, readonly ModelSurface[]> = {
  2: ['chatgpt', 'claude'],
  3: ['chatgpt', 'chatgptCloud', 'claude'],
}

export interface BrowserRuntimeConfig {
  replyTimeoutMinutes: number
  randomWait: { enabled: boolean; minSeconds: number; maxSeconds: number }
  deferredReply: { enabled: boolean; delayMinutes: number }
}

/**
 * v1 carries browser timing only; v2 also pins the model chosen per site; v3 adds the Codex cloud
 * surface and the default start link. Mirrors the workers contract.
 */
export interface RuntimeConfig {
  schemaVersion: 1 | 2 | 3 | 4
  browser: BrowserRuntimeConfig
  modelSelection?: ModelSelection
  defaultStartUrl?: string
  pageOverrides?: Partial<Record<RuntimePageUrl, PageRuntimeConfig>>
}

export function defaultModelSelection(version: 2 | 3 = 3): Record<ModelSurface, SiteModelSelection> {
  return Object.fromEntries(
    SURFACES_BY_VERSION[version].map((surface) => [surface, { model: null, reasoningEffort: null }]),
  ) as Record<ModelSurface, SiteModelSelection>
}

export function defaultRuntimeConfig(): RuntimeConfig {
  return {
    schemaVersion: 1,
    browser: {
      replyTimeoutMinutes: 30,
      randomWait: { enabled: false, minSeconds: 0, maxSeconds: 0 },
      deferredReply: { enabled: false, delayMinutes: 10 },
    },
  }
}

function object(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error('Invalid runtimeConfig.' + path + ' fields.')
  }
  return value as Record<string, unknown>
}
function integer(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Invalid runtimeConfig.' + path + '.')
  return value
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid runtimeConfig.' + path + '.')
  return value
}

function modelSelection(value: unknown, surfaces: readonly ModelSurface[]): ModelSelection {
  const sites = object(value, [...surfaces], 'modelSelection')
  const site = (name: ModelSurface): SiteModelSelection => {
    const path = 'modelSelection.' + name
    const item = object(sites[name], ['model', 'reasoningEffort'], path)
    const { model, reasoningEffort } = item
    if (
      model !== null &&
      (typeof model !== 'string' ||
        !model.trim() ||
        model.length > 128 ||
        [...model].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    ) {
      throw new Error('Invalid runtimeConfig.' + path + '.model.')
    }
    if (reasoningEffort !== null && !REASONING_EFFORTS.includes(reasoningEffort as ReasoningEffort)) {
      throw new Error('Invalid runtimeConfig.' + path + '.reasoningEffort.')
    }
    return {
      model: typeof model === 'string' ? model.trim() : null,
      reasoningEffort: reasoningEffort as ReasoningEffort | null,
    }
  }
  return Object.fromEntries(surfaces.map((surface) => [surface, site(surface)]))
}

/** Validate network/storage input and return a detached object in checksum order. */
export function normalizeRuntimeConfig(value: unknown): RuntimeConfig {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion
  if (version === 4) {
    const root = object(value, ['schemaVersion', 'browser', 'modelSelection', 'defaultStartUrl', 'pageOverrides'], '')
    const base = normalizeRuntimeConfig({
      schemaVersion: 3,
      browser: root.browser,
      modelSelection: root.modelSelection,
      defaultStartUrl: root.defaultStartUrl,
    })
    const raw = root.pageOverrides
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.keys(raw).some((key) => !RUNTIME_PAGE_URLS.includes(key as RuntimePageUrl))
    )
      throw new Error('Invalid runtimeConfig.pageOverrides fields.')
    const overrides: Partial<Record<RuntimePageUrl, PageRuntimeConfig>> = {}
    for (const url of RUNTIME_PAGE_URLS) {
      if (!Object.prototype.hasOwnProperty.call(raw, url)) continue
      const entry = object((raw as Record<string, unknown>)[url], ['browser', 'modelSelection'], 'pageOverrides.' + url)
      const models = { ...defaultModelSelection(3), chatgpt: entry.modelSelection }
      const normalized = normalizeRuntimeConfig({
        schemaVersion: 3,
        browser: entry.browser,
        modelSelection: models,
        defaultStartUrl: DEFAULT_START_URL,
      })
      overrides[url] = { browser: normalized.browser, modelSelection: normalized.modelSelection!.chatgpt! }
    }
    return { ...base, schemaVersion: 4, pageOverrides: overrides }
  }

  if (version !== 1 && version !== 2 && version !== 3) throw new Error('Unsupported runtimeConfig.schemaVersion.')
  const root = object(
    value,
    version === 1
      ? ['schemaVersion', 'browser']
      : version === 2
        ? ['schemaVersion', 'browser', 'modelSelection']
        : ['schemaVersion', 'browser', 'modelSelection', 'defaultStartUrl'],
    '',
  )
  const browser = object(root.browser, ['replyTimeoutMinutes', 'randomWait', 'deferredReply'], 'browser')
  const wait = object(browser.randomWait, ['enabled', 'minSeconds', 'maxSeconds'], 'browser.randomWait')
  const deferred = object(browser.deferredReply, ['enabled', 'delayMinutes'], 'browser.deferredReply')
  const min = integer(wait.minSeconds, 0, 86400, 'browser.randomWait.minSeconds')
  const max = integer(wait.maxSeconds, min, 86400, 'browser.randomWait.maxSeconds')
  return {
    schemaVersion: version,
    browser: {
      replyTimeoutMinutes: integer(browser.replyTimeoutMinutes, 1, 1440, 'browser.replyTimeoutMinutes'),
      randomWait: { enabled: boolean(wait.enabled, 'browser.randomWait.enabled'), minSeconds: min, maxSeconds: max },
      deferredReply: {
        enabled: boolean(deferred.enabled, 'browser.deferredReply.enabled'),
        delayMinutes: integer(deferred.delayMinutes, 0, 1440, 'browser.deferredReply.delayMinutes'),
      },
    },
    ...(version === 1 ? {} : { modelSelection: modelSelection(root.modelSelection, SURFACES_BY_VERSION[version]) }),
    ...(version === 3 ? { defaultStartUrl: startUrl(root.defaultStartUrl) } : {}),
  }
}

function startUrl(value: unknown): string {
  // Kept byte for byte: the checksum covers it, so no implementation may tidy the address.
  if (typeof value !== 'string' || !isStartUrl(value)) throw new Error('Invalid runtimeConfig.defaultStartUrl.')
  return value
}

/** Canonical links identify independent settings, even where pages share a model picker. */
export const RUNTIME_PAGE_URLS = [
  'https://chatgpt.com/',
  'https://chatgpt.com/images',
  'https://chatgpt.com/cloud',
  'https://claude.ai/new',
  'https://claude.ai/code',
] as const
export type RuntimePageUrl = (typeof RUNTIME_PAGE_URLS)[number]
export interface PageRuntimeConfig {
  browser: RuntimeConfig['browser']
  modelSelection: SiteModelSelection
}
export function runtimePageUrl(url: string): RuntimePageUrl | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname === 'chatgpt.com' || parsed.hostname === 'chat.openai.com') {
    if (/^\/(cloud|codex|local)(?:\/|$)/u.test(parsed.pathname)) return 'https://chatgpt.com/cloud'
    if (/^\/images(?:\/|$)/u.test(parsed.pathname)) return 'https://chatgpt.com/images'
    return 'https://chatgpt.com/'
  }
  if (parsed.hostname === 'claude.ai')
    return /^\/code(?:\/|$)/u.test(parsed.pathname) ? 'https://claude.ai/code' : 'https://claude.ai/new'
  return null
}
export function pageModelSurface(url: RuntimePageUrl): ModelSurface {
  return url === 'https://chatgpt.com/cloud'
    ? 'chatgptCloud'
    : url.startsWith('https://claude.ai/')
      ? 'claude'
      : 'chatgpt'
}
/** Old snapshots inherit their original global timing and per-surface selection without rewriting. */
export function resolvePageRuntimeConfig(config: RuntimeConfig, url: RuntimePageUrl): PageRuntimeConfig {
  return (
    config.pageOverrides?.[url] ?? {
      browser: config.browser,
      modelSelection: config.modelSelection?.[pageModelSurface(url)] ?? { model: null, reasoningEffort: null },
    }
  )
}
export function withPageRuntimeConfig(
  config: RuntimeConfig,
  url: RuntimePageUrl,
  page: PageRuntimeConfig,
): RuntimeConfig {
  return {
    schemaVersion: 4,
    browser: config.browser,
    modelSelection: { ...defaultModelSelection(3), ...config.modelSelection },
    defaultStartUrl: config.defaultStartUrl ?? DEFAULT_START_URL,
    pageOverrides: { ...config.pageOverrides, [url]: page },
  }
}
