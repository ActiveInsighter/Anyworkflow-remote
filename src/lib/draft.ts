import type { DispatchExecutionMode } from '../types'

const PREFIX = 'anyworkflow.editor-draft.'

export interface EditorDraft {
  source: string
  title: string
  mode: DispatchExecutionMode
  maxConcurrency: number
  templateTitle: string
  /** ISO instant, or `''` for "start immediately". */
  scheduledAt: string
  savedAt: number
}

/**
 * Drafts are keyed by what is being edited so a half-written plan never leaks into another Run,
 * template, or a brand new one.
 */
export type DraftScope = string

export function draftScopeFor(runId?: string, templateId?: string): DraftScope {
  if (runId) return `run:${runId}`
  if (templateId) return `template:${templateId}`
  return 'new'
}

/**
 * Every accessor swallows storage errors: localStorage can be unavailable (private browsing) or
 * full (quota), and losing an autosave is never worth breaking the editor over.
 */
export function readEditorDraft(scope: DraftScope): EditorDraft | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + scope)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EditorDraft>
    if (typeof parsed.source !== 'string' || !parsed.source) return null
    return {
      source: parsed.source,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      mode: parsed.mode === 'parallel' ? 'parallel' : 'serial',
      maxConcurrency: typeof parsed.maxConcurrency === 'number' ? parsed.maxConcurrency : 1,
      templateTitle: typeof parsed.templateTitle === 'string' ? parsed.templateTitle : '',
      scheduledAt: typeof parsed.scheduledAt === 'string' ? parsed.scheduledAt : '',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeEditorDraft(scope: DraftScope, draft: Omit<EditorDraft, 'savedAt'>): void {
  try {
    window.localStorage.setItem(PREFIX + scope, JSON.stringify({ ...draft, savedAt: Date.now() }))
  } catch {
    // Best effort only.
  }
}

export function clearEditorDraft(scope: DraftScope): void {
  try {
    window.localStorage.removeItem(PREFIX + scope)
  } catch {
    // Best effort only.
  }
}
