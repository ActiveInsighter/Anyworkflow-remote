import {
  DEFAULT_START_URL,
  defaultModelSelection,
  type BrowserRuntimeConfig,
  type ModelSelection,
  type RuntimeConfig,
} from '@/lib/domain/runtime-config'

const touched = (selection?: { model: string | null; reasoningEffort: string | null }) =>
  Boolean(selection && (selection.model !== null || selection.reasoningEffort !== null))

/**
 * Builds the smallest config version that can express the choices, so an untouched config keeps
 * its original bytes (and checksum) and older extensions can still claim the Run.
 * v1: timing only. v2: + chatgpt/claude models. v3: + Codex cloud models or a non-default start link.
 */
export function composeRuntimeConfig(
  browser: BrowserRuntimeConfig,
  models: ModelSelection,
  startUrl: string | null,
): RuntimeConfig {
  const customStart = startUrl !== null && startUrl !== DEFAULT_START_URL
  if (customStart || touched(models.chatgptCloud)) {
    return {
      schemaVersion: 3,
      browser,
      modelSelection: { ...defaultModelSelection(3), ...models },
      defaultStartUrl: startUrl ?? DEFAULT_START_URL,
    }
  }
  if (touched(models.chatgpt) || touched(models.claude)) {
    const { chatgpt, claude } = { ...defaultModelSelection(2), ...models }
    return { schemaVersion: 2, browser, modelSelection: { chatgpt, claude } }
  }
  return { schemaVersion: 1, browser }
}

/** Change the start page while retaining every independent page override. */
export function withDefaultStartUrl(config: RuntimeConfig, url: string): RuntimeConfig {
  return {
    ...config,
    schemaVersion: config.schemaVersion === 4 ? 4 : 3,
    modelSelection: { ...defaultModelSelection(3), ...config.modelSelection },
    defaultStartUrl: url,
  }
}
