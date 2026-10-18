export interface RuntimeConfig {
  schemaVersion: 1
  browser: {
    replyTimeoutMinutes: number
    randomWait: { enabled: boolean; minSeconds: number; maxSeconds: number }
    deferredReply: { enabled: boolean; delayMinutes: number }
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

/** Validate network/storage input and return a detached object in checksum order. */
export function normalizeRuntimeConfig(value: unknown): RuntimeConfig {
  const root = object(value, ['schemaVersion', 'browser'], '')
  if (root.schemaVersion !== 1) throw new Error('Unsupported runtimeConfig.schemaVersion.')
  const browser = object(root.browser, ['replyTimeoutMinutes', 'randomWait', 'deferredReply'], 'browser')
  const wait = object(browser.randomWait, ['enabled', 'minSeconds', 'maxSeconds'], 'browser.randomWait')
  const deferred = object(browser.deferredReply, ['enabled', 'delayMinutes'], 'browser.deferredReply')
  const min = integer(wait.minSeconds, 0, 86400, 'browser.randomWait.minSeconds')
  const max = integer(wait.maxSeconds, min, 86400, 'browser.randomWait.maxSeconds')
  return { schemaVersion: 1, browser: {
    replyTimeoutMinutes: integer(browser.replyTimeoutMinutes, 1, 1440, 'browser.replyTimeoutMinutes'),
    randomWait: { enabled: boolean(wait.enabled, 'browser.randomWait.enabled'), minSeconds: min, maxSeconds: max },
    deferredReply: { enabled: boolean(deferred.enabled, 'browser.deferredReply.enabled'),
      delayMinutes: integer(deferred.delayMinutes, 0, 1440, 'browser.deferredReply.delayMinutes') },
  } }
}
