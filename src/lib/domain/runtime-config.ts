export const REASONING_EFFORTS = [
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'standard', 'extended', 'heavy',
] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]
export type ModelSite = 'chatgpt' | 'claude'
export interface SiteModelSelection { model: string | null; reasoningEffort: ReasoningEffort | null }
export type ModelSelection = Record<ModelSite, SiteModelSelection>

export interface BrowserRuntimeConfig {
  replyTimeoutMinutes: number
  randomWait: { enabled: boolean; minSeconds: number; maxSeconds: number }
  deferredReply: { enabled: boolean; delayMinutes: number }
}

/** v1 carries browser timing only; v2 also pins the model chosen per site. Mirrors the workers contract. */
export interface RuntimeConfig {
  schemaVersion: 1 | 2
  browser: BrowserRuntimeConfig
  modelSelection?: ModelSelection
}

export function defaultModelSelection(): ModelSelection {
  return {
    chatgpt: { model: null, reasoningEffort: null },
    claude: { model: null, reasoningEffort: null },
  }
}

export function defaultRuntimeConfig(): RuntimeConfig {
  return { schemaVersion: 1, browser: {
    replyTimeoutMinutes: 30,
    randomWait: { enabled: false, minSeconds: 1, maxSeconds: 10 },
    deferredReply: { enabled: false, delayMinutes: 10 },
  } }
}

function object(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('Invalid runtimeConfig.' + path + ' fields.')
  }
  return value as Record<string, unknown>
}
function integer(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid runtimeConfig.' + path + '.')
  return value
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid runtimeConfig.' + path + '.')
  return value
}

function modelSelection(value: unknown): ModelSelection {
  const sites = object(value, ['chatgpt', 'claude'], 'modelSelection')
  const site = (name: ModelSite): SiteModelSelection => {
    const path = 'modelSelection.' + name
    const item = object(sites[name], ['model', 'reasoningEffort'], path)
    const { model, reasoningEffort } = item
    if (model !== null && (typeof model !== 'string' || !model.trim() || model.length > 128 ||
        [...model].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
      throw new Error('Invalid runtimeConfig.' + path + '.model.')
    }
    if (reasoningEffort !== null && !REASONING_EFFORTS.includes(reasoningEffort as ReasoningEffort)) {
      throw new Error('Invalid runtimeConfig.' + path + '.reasoningEffort.')
    }
    return { model: typeof model === 'string' ? model.trim() : null, reasoningEffort: reasoningEffort as ReasoningEffort | null }
  }
  return { chatgpt: site('chatgpt'), claude: site('claude') }
}

/** Validate network/storage input and return a detached object in checksum order. */
export function normalizeRuntimeConfig(value: unknown): RuntimeConfig {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion
  if (version !== 1 && version !== 2) throw new Error('Unsupported runtimeConfig.schemaVersion.')
  const root = object(value, version === 1 ? ['schemaVersion', 'browser'] : ['schemaVersion', 'browser', 'modelSelection'], '')
  const browser = object(root.browser, ['replyTimeoutMinutes', 'randomWait', 'deferredReply'], 'browser')
  const wait = object(browser.randomWait, ['enabled', 'minSeconds', 'maxSeconds'], 'browser.randomWait')
  const deferred = object(browser.deferredReply, ['enabled', 'delayMinutes'], 'browser.deferredReply')
  const min = integer(wait.minSeconds, 0, 86400, 'browser.randomWait.minSeconds')
  const max = integer(wait.maxSeconds, min, 86400, 'browser.randomWait.maxSeconds')
  return { schemaVersion: version, browser: {
    replyTimeoutMinutes: integer(browser.replyTimeoutMinutes, 1, 1440, 'browser.replyTimeoutMinutes'),
    randomWait: { enabled: boolean(wait.enabled, 'browser.randomWait.enabled'), minSeconds: min, maxSeconds: max },
    deferredReply: { enabled: boolean(deferred.enabled, 'browser.deferredReply.enabled'),
      delayMinutes: integer(deferred.delayMinutes, 0, 1440, 'browser.deferredReply.delayMinutes') },
  }, ...(version === 2 ? { modelSelection: modelSelection(root.modelSelection) } : {}) }
}
