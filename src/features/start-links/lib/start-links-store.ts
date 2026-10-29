import { toErrorMessage } from '@/lib/api'
import { getSession, SESSION_CHANGE_EVENT } from '@/lib/api/session'
import { getUserPreferences, saveStartLinks as writeStartLinks } from '@/lib/api/user-preferences'
import { DEFAULT_START_LINKS, normalizeStartLinks, type StartLink } from '@/lib/domain/start-links'
import { readStorage, writeStorage } from '@/lib/platform/storage'

export interface StartLinksSnapshot {
  /** The links to offer: the account's own list, or the defaults until it saves one. */
  links: readonly StartLink[]
  customized: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
}

interface AccountState {
  scope: string
  recordId: string | null
  snapshot: StartLinksSnapshot
  request: Promise<void> | null
}

const CACHE_PREFIX = 'anyworkflow.start-links.v1.'
const SIGNED_OUT: StartLinksSnapshot = Object.freeze({
  links: DEFAULT_START_LINKS,
  customized: false,
  status: 'idle',
  error: '',
})

const listeners = new Set<() => void>()
let account: AccountState | null = null

function scopeOfSession(): string | null {
  const session = getSession()
  return session ? JSON.stringify([session.baseUrl, session.record.id]) : null
}

function readCache(scope: string): { recordId: string | null; links: StartLink[] | null } {
  try {
    const raw = readStorage(CACHE_PREFIX + scope)
    if (!raw) return { recordId: null, links: null }
    const parsed = JSON.parse(raw) as { recordId?: unknown; links?: unknown }
    return {
      recordId: typeof parsed.recordId === 'string' ? parsed.recordId : null,
      links: normalizeStartLinks(parsed.links),
    }
  } catch {
    return { recordId: null, links: null }
  }
}

function snapshotOf(links: StartLink[] | null, status: StartLinksSnapshot['status'], error = ''): StartLinksSnapshot {
  return Object.freeze({ links: links ?? DEFAULT_START_LINKS, customized: links !== null, status, error })
}

function emit() {
  for (const listener of listeners) listener()
}

/** The state for the signed-in account, created (from the local cache) on first use. */
function current(): AccountState | null {
  const scope = scopeOfSession()
  if (!scope) {
    account = null
    return null
  }
  if (account?.scope !== scope) {
    const cached = readCache(scope)
    account = { scope, recordId: cached.recordId, snapshot: snapshotOf(cached.links, 'idle'), request: null }
  }
  return account
}

function commit(state: AccountState, recordId: string | null, links: StartLink[] | null) {
  if (account !== state) return
  state.recordId = recordId
  state.snapshot = snapshotOf(links, 'ready')
  writeStorage(CACHE_PREFIX + state.scope, JSON.stringify({ recordId, links }))
  emit()
}

/** Fetches the account's list once per session; later calls reuse the result. */
export function loadStartLinks(force = false): Promise<void> {
  const state = current()
  if (!state) return Promise.resolve()
  if (state.request && !force) return state.request
  if (state.snapshot.status === 'ready' && !force) return Promise.resolve()
  state.snapshot = Object.freeze({ ...state.snapshot, status: 'loading', error: '' })
  emit()
  state.request = getUserPreferences()
    .then((preferences) => commit(state, preferences.id, preferences.startLinks))
    .catch((cause: unknown) => {
      if (account !== state) return
      // Keep showing the cached or default links; only the status reports the failure.
      state.snapshot = Object.freeze({ ...state.snapshot, status: 'error', error: toErrorMessage(cause) })
      emit()
    })
    .finally(() => {
      if (account === state) state.request = null
    })
  return state.request
}

/** Saves the whole list for the signed-in account. Rejects on failure; the list is unchanged then. */
export async function saveStartLinks(links: readonly StartLink[]): Promise<void> {
  const state = current()
  if (!state) throw new Error('请先连接 AnyWorkflow')
  const saved = await writeStartLinks(links, state.recordId)
  commit(state, saved.id, saved.startLinks ?? [])
}

/** A different account gets its own state on the next read; subscribers re-read on switch. */
const onSessionChange = () => emit()

export function subscribeStartLinks(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener(SESSION_CHANGE_EVENT, onSessionChange)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener(SESSION_CHANGE_EVENT, onSessionChange)
  }
}

export function getStartLinksSnapshot(): StartLinksSnapshot {
  return current()?.snapshot ?? SIGNED_OUT
}
