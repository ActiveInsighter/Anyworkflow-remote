import type { DispatchExecutionMode } from '../types'
import { readStorage, removeStorage, writeStorage } from './storage'
import { normalizeRecurrence, type DailyRecurrence } from './recurrence'
import { normalizeRuntimeConfig, type RuntimeConfig } from './runtime-config'

const PREFIX = 'anyworkflow.editor-draft.'

// An unfinished time field is valid local editing state. It must not erase the DSL draft.
function readDraftRecurrence(value: unknown): DailyRecurrence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  try {
    const rule = normalizeRecurrence({ ...raw, time: raw.time === '' ? '09:00' : raw.time })
    return { ...rule, time: raw.time === '' ? '' : rule.time }
  } catch { return null }
}

export interface EditorDraft {
  recurrence?: DailyRecurrence | null
  runtimeConfig?: RuntimeConfig | null
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

export function draftScopeFor(baseUrl: string | undefined, ownerId: string | undefined, runId?: string, templateId?: string): DraftScope {
  const backend = baseUrl?.trim().replace(/\/+$/u, '') || 'disconnected'
  const owner = JSON.stringify([backend, ownerId?.trim() || 'anonymous'])
  if (runId) return `${owner}:run:${runId}`
  if (templateId) return `${owner}:template:${templateId}`
  return `${owner}:new`
}

/** Legacy keys do not identify a backend. Read only for an explicitly confirmed recovery. */
export function legacyDraftScopeFor(ownerId: string | undefined, runId?: string, templateId?: string): DraftScope {
  const owner = ownerId?.trim() || 'anonymous'
  if (runId) return `${owner}:run:${runId}`
  if (templateId) return `${owner}:template:${templateId}`
  return `${owner}:new`
}

/**
 * Every accessor swallows storage errors: localStorage can be unavailable (private browsing) or
 * full (quota), and losing an autosave is never worth breaking the editor over.
 */
export function readEditorDraft(scope: DraftScope): EditorDraft | null {
  const raw = readStorage(PREFIX + scope)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<EditorDraft>
    if (typeof parsed.source !== 'string' || !parsed.source) return null
    return {
      source: parsed.source,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      mode: parsed.mode === 'parallel' ? 'parallel' : 'serial',
      maxConcurrency: typeof parsed.maxConcurrency === 'number' ? parsed.maxConcurrency : 1,
      templateTitle: typeof parsed.templateTitle === 'string' ? parsed.templateTitle : '',
      scheduledAt: typeof parsed.scheduledAt === 'string' ? parsed.scheduledAt : '',
      ...(parsed.recurrence !== undefined ? { recurrence: readDraftRecurrence(parsed.recurrence) } : {}),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      ...(parsed.runtimeConfig !== undefined ? { runtimeConfig: parsed.runtimeConfig === null ? null : normalizeRuntimeConfig(parsed.runtimeConfig) } : {}),
    }
  } catch {
    return null
  }
}

export function writeEditorDraft(scope: DraftScope, draft: Omit<EditorDraft, 'savedAt'>): void {
  writeStorage(PREFIX + scope, JSON.stringify({ ...draft, savedAt: Date.now() }))
}

export function clearEditorDraft(scope: DraftScope): void {
  removeStorage(PREFIX + scope)
}
