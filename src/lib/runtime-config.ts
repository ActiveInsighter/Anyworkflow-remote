export const REASONING_EFFORTS = [
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'standard', 'extended', 'heavy',
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export interface ModelSelection {
  /** Null preserves the current selection. Model ids and visible model names are accepted. */
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
}
export interface BrowserModelSelection {
  chatgpt: ModelSelection;
  claude: ModelSelection;
}
export interface RuntimeConfig {
  schemaVersion: 1 | 2;
  browser: {
    replyTimeoutMinutes: number;
    randomWait: { enabled: boolean; minSeconds: number; maxSeconds: number };
    deferredReply: { enabled: boolean; delayMinutes: number };
  };
  /** Present only in v2. A v1 snapshot keeps its original canonical bytes and checksum. */
  modelSelection?: BrowserModelSelection;
}

export function defaultModelSelection(): BrowserModelSelection {
  return {
    chatgpt: { model: null, reasoningEffort: null },
    claude: { model: null, reasoningEffort: null },
  };
}

export function defaultRuntimeConfig(): RuntimeConfig {
  return {
    schemaVersion: 1,
    browser: {
      replyTimeoutMinutes: 30,
      randomWait: { enabled: false, minSeconds: 1, maxSeconds: 10 },
      deferredReply: { enabled: false, delayMinutes: 10 },
    },
  };
}

function object(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error('Invalid runtimeConfig.' + path + ' fields.');
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Invalid runtimeConfig.' + path + '.');
  return value;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid runtimeConfig.' + path + '.');
  return value;
}

/** Validate network/storage input and return a detached object in checksum order. */
export function normalizeRuntimeConfig(value: unknown): RuntimeConfig {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== 1 && version !== 2) throw new Error('Unsupported runtimeConfig.schemaVersion.');
  const root = object(value, version === 1 ? ['schemaVersion', 'browser'] :
    ['schemaVersion', 'browser', 'modelSelection'], '');
  const browser = object(
    root.browser,
    ['replyTimeoutMinutes', 'randomWait', 'deferredReply'],
    'browser',
  );
  const wait = object(
    browser.randomWait,
    ['enabled', 'minSeconds', 'maxSeconds'],
    'browser.randomWait',
  );
  const deferred = object(
    browser.deferredReply,
    ['enabled', 'delayMinutes'],
    'browser.deferredReply',
  );
  const min = integer(wait.minSeconds, 0, 86400, 'browser.randomWait.minSeconds');
  const max = integer(wait.maxSeconds, min, 86400, 'browser.randomWait.maxSeconds');
  return {
    schemaVersion: version,
    browser: {
      replyTimeoutMinutes: integer(
        browser.replyTimeoutMinutes,
        1,
        1440,
        'browser.replyTimeoutMinutes',
      ),
      randomWait: {
        enabled: boolean(wait.enabled, 'browser.randomWait.enabled'),
        minSeconds: min,
        maxSeconds: max,
      },
      deferredReply: {
        enabled: boolean(deferred.enabled, 'browser.deferredReply.enabled'),
        delayMinutes: integer(deferred.delayMinutes, 0, 1440, 'browser.deferredReply.delayMinutes'),
      },
    },
    ...(version === 2 ? { modelSelection: normalizeModelSelection(root.modelSelection) } : {}),
  };
}

function normalizeModelSelection(value: unknown): BrowserModelSelection {
  const sites = object(value, ['chatgpt', 'claude'], 'modelSelection');
  const selection = (site: 'chatgpt' | 'claude'): ModelSelection => {
    const path = `modelSelection.${site}`;
    const item = object(sites[site], ['model', 'reasoningEffort'], path);
    const model = item.model;
    if (model !== null && (typeof model !== 'string' || !model.trim() ||
      model.length > 128 || [...model].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) {
      throw new Error(`Invalid runtimeConfig.${path}.model.`);
    }
    const effort = item.reasoningEffort;
    if (effort !== null && !REASONING_EFFORTS.includes(effort as ReasoningEffort)) {
      throw new Error(`Invalid runtimeConfig.${path}.reasoningEffort.`);
    }
    return { model: typeof model === 'string' ? model.trim() : null,
      reasoningEffort: effort as ReasoningEffort | null };
  };
  return { chatgpt: selection('chatgpt'), claude: selection('claude') };
}
