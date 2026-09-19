import { useCallback, useEffect, useRef, useState, type DependencyList, type Dispatch, type SetStateAction } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string
  reload: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
}

type CacheEntry = { value: unknown; updatedAt: number }
const CACHE_LIMIT = 100
const queryCache = new Map<string, CacheEntry>()

function readCache<T>(key?: string): { value: T; updatedAt: number } | null {
  if (!key) return null
  const entry = queryCache.get(key)
  if (!entry) return null
  // Refresh insertion order so the small in-memory cache behaves like an LRU.
  queryCache.delete(key)
  queryCache.set(key, entry)
  return entry as { value: T; updatedAt: number }
}

function writeCache<T>(key: string | undefined, value: T) {
  if (!key) return
  queryCache.delete(key)
  queryCache.set(key, { value, updatedAt: Date.now() })
  while (queryCache.size > CACHE_LIMIT) {
    const oldest = queryCache.keys().next().value as string | undefined
    if (!oldest) break
    queryCache.delete(oldest)
  }
}

export function invalidateAsyncDataCache(prefix?: string) {
  if (!prefix) {
    queryCache.clear()
    return
  }
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) queryCache.delete(key)
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
  const initial = readCache<T>(options.cacheKey)
  const [data, setDataState] = useState<T | null>(() => initial?.value ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const loaderRef = useRef(loader)
  const errorMessageRef = useRef(options.errorMessage)
  loaderRef.current = loader
  errorMessageRef.current = options.errorMessage
  const enabled = options.enabled ?? true
  const staleMs = options.staleMs ?? 0

  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((next) => {
    setDataState((current) => {
      const value = typeof next === 'function'
        ? (next as (previous: T | null) => T | null)(current)
        : next
      if (value !== null) writeCache(options.cacheKey, value)
      return value
    })
  }, [options.cacheKey])

  const load = useCallback(async (force: boolean) => {
    if (!enabled) return

    const cached = readCache<T>(options.cacheKey)
    if (!force && cached && Date.now() - cached.updatedAt < staleMs) {
      setDataState(cached.value)
      setLoading(false)
      setError('')
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')

    try {
      const result = await loaderRef.current(controller.signal)
      if (!controller.signal.aborted) {
        writeCache(options.cacheKey, result)
        setDataState(result)
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = errorMessageRef.current?.(cause) || (cause instanceof Error ? cause.message : '加载失败')
        setError(message)
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [enabled, options.cacheKey, staleMs, ...deps])

  const reload = useCallback(() => load(true), [load])

  useEffect(() => {
    if (!enabled) {
      setDataState(null)
      setLoading(false)
      setError('')
      return
    }

    void load(false)
    if (!options.pollMs) return () => controllerRef.current?.abort()

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, options.pollMs)

    return () => {
      window.clearInterval(timer)
      controllerRef.current?.abort()
    }
  }, [enabled, load, options.pollMs])

  return { data, loading, error, reload, setData }
}
