import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from './storage'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Keep in sync with the pre-paint script in index.html. */
const THEME_KEY = 'anyworkflow.theme.v1'
const THEME_EVENT = 'anyworkflow:theme-change'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Browser chrome colour; mirrors `--background` in styles/tokens/color.css. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#101114' }

export const themeLabels: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
}

let cachedRaw: string | null | undefined
let cachedPreference: ThemePreference = 'system'

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

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/**
 * Colour transitions would otherwise animate every surface from the old palette for a frame or
 * two, so the switch briefly disables them and restores them after the new styles apply.
 */
function withoutTransitions(change: () => void): void {
  const style = document.createElement('style')
  style.textContent = '*,*::before,*::after{transition:none!important}'
  document.head.append(style)
  change()
  // Reading a computed style flushes the change before transitions come back.
  void window.getComputedStyle(document.body).color
  window.requestAnimationFrame(() => style.remove())
}

/** Tokens switch on the `.dark` class; `color-scheme` keeps native controls in step. */
function applyPreference(preference: ThemePreference): void {
  const theme = resolveTheme(preference)
  const root = document.documentElement
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  // The pre-paint script in index.html usually applied it already.
  if (root.classList.contains('dark') === (theme === 'dark') && root.style.colorScheme === theme) return
  withoutTransitions(() => {
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  })
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
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return
    cachedRaw = undefined
    applyPreference(readPreference())
    listener()
  }
  window.addEventListener(THEME_EVENT, listener)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(THEME_EVENT, listener)
    window.removeEventListener('storage', handleStorage)
  }
}

/**
 * Applies the stored preference before React renders and keeps "system" in step with the OS.
 * index.html runs the same resolution inline so the first paint already has the right theme.
 */
export function initTheme(): void {
  applyPreference(readPreference())
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (readPreference() === 'system') applyPreference('system')
  })
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => 'system' as ThemePreference)
}
