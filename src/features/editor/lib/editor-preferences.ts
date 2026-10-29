import { readStorage, writeStorage } from '../../../lib/platform/storage.ts'

/**
 * Display preferences of the editor. They describe this device's screen, not the account, so
 * they stay in local storage rather than following the user to a phone.
 */
export interface EditorPreferences {
  fontSize: EditorFontSize
  lineWrap: boolean
  lineNumbers: boolean
  /** Outline/issues side panel on wide screens. */
  panel: boolean
}

export const EDITOR_FONT_SIZES = [
  { value: 'small', label: '小', px: 13 },
  { value: 'medium', label: '中', px: 14 },
  { value: 'large', label: '大', px: 16 },
] as const
export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number]['value']

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = Object.freeze({
  fontSize: 'medium',
  lineWrap: true,
  lineNumbers: true,
  panel: true,
})

const KEY = 'anyworkflow.editor.preferences.v1'

/** Phones start without line numbers: the gutter costs a tenth of the line there. */
export function defaultEditorPreferences(narrow: boolean): EditorPreferences {
  return narrow ? { ...DEFAULT_EDITOR_PREFERENCES, lineNumbers: false } : DEFAULT_EDITOR_PREFERENCES
}

export function parseEditorPreferences(raw: string | null | undefined, narrow = false): EditorPreferences {
  const defaults = defaultEditorPreferences(narrow)
  if (!raw) return defaults
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof EditorPreferences, unknown>>
    const bool = (key: 'lineWrap' | 'lineNumbers' | 'panel') =>
      typeof value[key] === 'boolean' ? value[key] : defaults[key]
    return {
      fontSize: EDITOR_FONT_SIZES.some((size) => size.value === value.fontSize)
        ? (value.fontSize as EditorFontSize)
        : defaults.fontSize,
      lineWrap: bool('lineWrap'),
      lineNumbers: bool('lineNumbers'),
      panel: bool('panel'),
    }
  } catch {
    return defaults
  }
}

const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767.98px)').matches

const listeners = new Set<() => void>()
/** Distinct from every storage result, including `undefined` when storage is unavailable. */
const UNREAD = Symbol('unread')
let cachedRaw: string | null | undefined | typeof UNREAD = UNREAD
let cached: EditorPreferences = DEFAULT_EDITOR_PREFERENCES

export function getEditorPreferences(): EditorPreferences {
  const raw = readStorage(KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parseEditorPreferences(raw, isNarrow())
  }
  return cached
}

export function updateEditorPreferences(patch: Partial<EditorPreferences>): void {
  const next = { ...getEditorPreferences(), ...patch }
  const raw = JSON.stringify(next)
  writeStorage(KEY, raw)
  cachedRaw = readStorage(KEY) === raw ? raw : cachedRaw
  cached = next
  for (const listener of listeners) listener()
}

export function subscribeEditorPreferences(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function fontSizePx(size: EditorFontSize): number {
  return EDITOR_FONT_SIZES.find((item) => item.value === size)?.px ?? 14
}
