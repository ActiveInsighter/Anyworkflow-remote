import { useCallback, useEffect, useRef, useState, type DependencyList, type Dispatch, type SetStateAction } from 'react'
import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from '@/lib/session'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  refreshing: boolean
  error: string
  reload: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
}

interface CacheEntry<T> {
  data: T
  updatedAt: number
}

const CACHE_LIMIT = 100
const cache = new Map<string, CacheEntry<unknown>>()
let sessionCacheListenersInstalled = false

function clearCacheForSessionChange() {
  cache.clear()
}

function ensureSessionCacheIsolation() {
  if (sessionCacheListenersInstalled || typeof window === 'undefined') return
  sessionCacheListenersInstalled = true
  window.addEventListener(SESSION_CHANGE_EVENT, clearCacheForSessionChange)
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_STORAGE_KEY || event.key === null) clearCacheForSessionChange()
  })
}

ensureSessionCacheIsolation()

function readCache<T>(key?: string): CacheEntry<T> | null {
  if (!key) return null
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null

  // Refresh insertion order so frequently revisited pages stay warm.
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

function writeCache<T>(key: string | undefined, data: T) {
  if (!key) return
  cache.delete(key)
  cache.set(key, { data, updatedAt: Date.now() })

  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined
    if (!oldest) break
    cache.delete(oldest)
  }
}

/** Invalidates one cached query family after a mutation. */
export function invalidateAsyncDataCache(prefix?: string) {
  if (!prefix) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

export function useAsyncData<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  options: {
    enabled?: boolean
    pollMs?: number
    staleMs?: number
    cacheKey?: string
    errorMessage?: (error: unknown) => string
  } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true
  const cacheKey = options.cacheKey
  const staleMs = options.staleMs ?? 0
  const initial = readCache<T>(cacheKey)
  const [data, setDataState] = useState<T | null>(() => initial?.data ?? null)
  const dataRef = useRef<T | null>(initial?.data ?? null)
  const [loading, setLoading] = useState(() => !initial && enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const activeCacheKeyRef = useRef(cacheKey)

  const setData: Dispatch<SetStateAction<T | null>> = useCallback((value) => {
    setDataState((current) => {
      const next = typeof value === 'function'
        ? (value as (previous: T | null) => T | null)(current)
        : value
      dataRef.current = next
      if (next !== null) writeCache(cacheKey, next)
      return next
    })
  }, [cacheKey])

  const reload = useCallback(async () => {
    if (!enabled) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const cached = readCache<T>(cacheKey)
    const hasData = dataRef.current !== null || cached !== null
    setLoading(!hasData)
    setRefreshing(hasData)
    setError('')

    try {
      const result = await loader(controller.signal)
      if (controller.signal.aborted) return
      writeCache(cacheKey, result)
      dataRef.current = result
      setDataState(result)
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = options.errorMessage?.(cause) || (cause instanceof Error ? cause.message : '加载失败')
        setError(message)
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  // The caller controls loader identity with deps, matching React's effect dependency model.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, cacheKey])

  useEffect(() => {
    if (!enabled) {
      dataRef.current = null
      setDataState(null)
      setLoading(false)
      setRefreshing(false)
      setError('')
      return
    }

    const keyChanged = activeCacheKeyRef.current !== cacheKey
    activeCacheKeyRef.current = cacheKey
    const cached = readCache<T>(cacheKey)
    if (cached) {
      dataRef.current = cached.data
      setDataState(cached.data)
      setLoading(false)
      setRefreshing(false)
      if (Date.now() - cached.updatedAt >= staleMs) void reload()
    } else {
      if (keyChanged) {
        controllerRef.current?.abort()
        dataRef.current = null
        setDataState(null)
        setLoading(true)
        setRefreshing(false)
        setError('')
      }
      void reload()
    }

    if (!options.pollMs) return () => controllerRef.current?.abort()

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, options.pollMs)

    return () => {
      window.clearInterval(timer)
      controllerRef.current?.abort()
    }
  }, [enabled, reload, options.pollMs, staleMs, cacheKey])

  return { data, loading, refreshing, error, reload, setData }
}
