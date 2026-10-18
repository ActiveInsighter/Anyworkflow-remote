/**
 * Pages a Task can start on. Each link belongs to one model-picker surface (see
 * `runtime-config.ts`): pages with the same DOM share a surface and therefore the same models.
 */
import type { ModelSurface } from './runtime-config.ts'

export interface StartLink {
  id: string
  label: string
  url: string
  surface: ModelSurface
}

export const START_LINKS: readonly StartLink[] = [
  { id: 'chatgpt', label: 'ChatGPT 主界面', url: 'https://chatgpt.com/', surface: 'chatgpt' },
  { id: 'chatgpt-cloud', label: 'ChatGPT Cloud 界面', url: 'https://chatgpt.com/cloud', surface: 'chatgptCloud' },
  { id: 'chatgpt-images', label: 'ChatGPT 图片界面', url: 'https://chatgpt.com/images', surface: 'chatgpt' },
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
