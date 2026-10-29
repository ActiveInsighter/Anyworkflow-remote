/**
 * The pages that carry their own runtime settings. This list is a backend contract: the keys of
 * `runtimeConfig.pageOverrides` are exactly these URLs, so it is fixed and not user-editable.
 * Pages with the same DOM share a model-picker surface (see `runtime-config.ts`).
 *
 * Shortcuts for a Task's `start_url` are a separate, user-editable list (`start-links.ts`).
 */
import type { ModelSurface, RuntimePageUrl } from './runtime-config.ts'

export interface RuntimePage {
  id: string
  label: string
  url: RuntimePageUrl
  surface: ModelSurface
}

export const RUNTIME_PAGES: readonly RuntimePage[] = [
  { id: 'chatgpt', label: 'ChatGPT 主界面', url: 'https://chatgpt.com/', surface: 'chatgpt' },
  { id: 'chatgpt-images', label: 'ChatGPT 图片界面', url: 'https://chatgpt.com/images', surface: 'chatgpt' },
  { id: 'chatgpt-cloud', label: 'ChatGPT Cloud 界面', url: 'https://chatgpt.com/cloud', surface: 'chatgptCloud' },
  { id: 'claude-new', label: 'Claude 主界面', url: 'https://claude.ai/new', surface: 'claude' },
  { id: 'claude-code', label: 'Claude Code 界面', url: 'https://claude.ai/code', surface: 'claude' },
]

/** Model surface of the page `url` points at, or null for addresses outside the known sites. */
export function surfaceOfUrl(url: string): ModelSurface | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname === 'claude.ai') return 'claude'
  if (parsed.hostname === 'chatgpt.com' || parsed.hostname === 'chat.openai.com') {
    return /^\/(?:cloud|codex|local)(?:\/|$)/u.test(parsed.pathname) ? 'chatgptCloud' : 'chatgpt'
  }
  return null
}
