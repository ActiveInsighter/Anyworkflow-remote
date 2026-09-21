import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from './storage'

export type ThemePreference = 'system' | 'light' | 'dark'

const THEME_KEY = 'anyworkflow.theme.v1'
const THEME_EVENT = 'anyworkflow:theme-change'

let cachedRaw: string | null | undefined
let cachedPreference: ThemePreference = 'system'

const LIGHT_THEME_COLOR = '#f7f8f8'
const DARK_THEME_COLOR = '#000000'

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

/**
 * useSyncExternalStore requires getSnapshot to stay referentially stable while the store
 * has not changed. A string primitive satisfies that naturally.
 */
function readPreference(): ThemePreference {
  const raw = readStorage(THEME_KEY) ?? null

  if (raw === cachedRaw) return cachedPreference
  cachedRaw = raw
  cachedPreference = isPreference(raw) ? raw : 'system'
  return cachedPreference
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') root.removeAttribute('data-theme')
  else root.dataset.theme = preference

  const isDark = preference === 'system' ? prefersDark() : preference === 'dark'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

export function getThemePreference(): ThemePreference {
  return readPreference()
}

export function setThemePreference(preference: ThemePreference): void {
  writeStorage(THEME_KEY, preference)
  cachedRaw = preference
  cachedPreference = preference
  applyPreference(preference)
  window.dispatchEvent(new Event(THEME_EVENT))
}

export function cycleThemePreference(preference: ThemePreference): ThemePreference {
  if (preference === 'system') return 'light'
  if (preference === 'light') return 'dark'
  return 'system'
}

function subscribe(listener: () => void): () => void {
  const handleChange = () => {
    applyPreference(readPreference())
    listener()
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return
    cachedRaw = undefined
    handleChange()
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handleMediaChange = () => {
    if (readPreference() !== 'system') return
    applyPreference('system')
    listener()
  }

  window.addEventListener(THEME_EVENT, handleChange)
  window.addEventListener('storage', handleStorage)
  media.addEventListener('change', handleMediaChange)
  return () => {
    window.removeEventListener(THEME_EVENT, handleChange)
    window.removeEventListener('storage', handleStorage)
    media.removeEventListener('change', handleMediaChange)
  }
}

export const themeLabels: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
}

/** Applies the stored preference before React renders, avoiding a flash of the wrong theme. */
export function initTheme(): void {
  applyPreference(readPreference())
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => 'system' as ThemePreference)
}
