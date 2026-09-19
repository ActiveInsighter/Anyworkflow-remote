import { useSyncExternalStore } from 'react'
import { DEFAULT_POCKETBASE_URL } from './config'
import type { AuthSession } from '../types'

export const SESSION_STORAGE_KEY = 'anyworkflow.auth.session.v1'
const BASE_URL_KEY = 'anyworkflow.pocketbase.url.v1'
export const SESSION_CHANGE_EVENT = 'anyworkflow:session-change'

let cachedSessionRaw: string | null | undefined
let cachedSession: AuthSession | null = null

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('PocketBase 地址必须使用 HTTPS')
  }
  return url.toString().replace(/\/$/u, '')
}

function isSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AuthSession>
  return Boolean(
    typeof candidate.token === 'string' &&
      candidate.token.trim() &&
      candidate.record &&
      typeof candidate.record.id === 'string' &&
      candidate.record.id &&
      typeof candidate.baseUrl === 'string',
  )
}

function readSessionSnapshot(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY)

  // useSyncExternalStore requires getSnapshot() to return the same reference
  // while the underlying store has not changed. Parsing JSON on every call
  // creates a new object and can cause an infinite React render loop.
  if (raw === cachedSessionRaw) return cachedSession

  cachedSessionRaw = raw
  if (!raw) {
    cachedSession = null
    return cachedSession
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    cachedSession = isSession(parsed) ? parsed : null
  } catch {
    cachedSession = null
  }

  return cachedSession
}

export function getBaseUrl(): string {
  const raw = localStorage.getItem(BASE_URL_KEY)
  if (!raw) return DEFAULT_POCKETBASE_URL
  try {
    return normalizeBaseUrl(raw)
  } catch {
    return DEFAULT_POCKETBASE_URL
  }
}

export function saveBaseUrl(value: string): string {
  const normalized = normalizeBaseUrl(value)
  localStorage.setItem(BASE_URL_KEY, normalized)
  return normalized
}

export function getSession(): AuthSession | null {
  return readSessionSnapshot()
}

export function setSession(session: AuthSession): void {
  const raw = JSON.stringify(session)
  localStorage.setItem(SESSION_STORAGE_KEY, raw)
  cachedSessionRaw = raw
  cachedSession = session
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  cachedSessionRaw = null
  cachedSession = null
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

export function requireSession(): AuthSession {
  const session = getSession()
  if (!session) throw new Error('请先连接 AnyWorkflow')
  return session
}

function subscribe(listener: () => void): () => void {
  const handleSessionChange = () => listener()
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_STORAGE_KEY && event.key !== null) return
    cachedSessionRaw = undefined
    listener()
  }

  window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
    window.removeEventListener('storage', handleStorage)
  }
}

export function useSession(): AuthSession | null {
  return useSyncExternalStore(subscribe, readSessionSnapshot, () => null)
}
