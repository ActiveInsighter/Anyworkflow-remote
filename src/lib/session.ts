import { useSyncExternalStore } from 'react'
import { DEFAULT_POCKETBASE_URL } from './config'
import type { AuthSession } from '../types'

const SESSION_KEY = 'anyworkflow.auth.session.v1'
const BASE_URL_KEY = 'anyworkflow.pocketbase.url.v1'
const SESSION_EVENT = 'anyworkflow:session-change'

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
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function setSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event(SESSION_EVENT))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(SESSION_EVENT))
}

export function requireSession(): AuthSession {
  const session = getSession()
  if (!session) throw new Error('请先连接 AnyWorkflow')
  return session
}

function subscribe(listener: () => void): () => void {
  const handler = () => listener()
  window.addEventListener(SESSION_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(SESSION_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function useSession(): AuthSession | null {
  return useSyncExternalStore(subscribe, getSession, () => null)
}
