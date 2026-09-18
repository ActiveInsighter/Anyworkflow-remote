import { useCallback, useEffect, useRef, useState, type DependencyList, type Dispatch, type SetStateAction } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string
  reload: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
}

export function useAsyncData<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  options: {
    enabled?: boolean
    pollMs?: number
    errorMessage?: (error: unknown) => string
  } = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const enabled = options.enabled ?? true

  const reload = useCallback(async () => {
    if (!enabled) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')

    try {
      const result = await loader(controller.signal)
      if (!controller.signal.aborted) setData(result)
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = options.errorMessage?.(cause) || (cause instanceof Error ? cause.message : '加载失败')
        setError(message)
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, deps)

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setLoading(false)
      setError('')
      return
    }

    void reload()
    if (!options.pollMs) return () => controllerRef.current?.abort()

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, options.pollMs)

    return () => {
      window.clearInterval(timer)
      controllerRef.current?.abort()
    }
  }, [enabled, reload, options.pollMs])

  return { data, loading, error, reload, setData }
}
