import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { toErrorMessage } from '@/lib/api/errors'

export interface AsyncActionOptions {
  /** Toast shown after the action resolves. Omit when the action navigates away or toasts itself. */
  success?: string
  /**
   * Toast title when the action throws; the error message becomes the description. Pass `false`
   * where the inline error is the only report (avoids showing the same text twice).
   */
  failure?: string | false
}

/**
 * One mutation at a time for a view: tracks which action is running, keeps the last error for
 * an inline banner, and reports the outcome with a toast. Re-entrant calls are ignored, so a
 * double click can never send the same write twice.
 */
export function useAsyncAction() {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const pendingRef = useRef<string | null>(null)

  const run = useCallback(
    async <T,>(key: string, action: () => Promise<T>, options: AsyncActionOptions = {}): Promise<T | undefined> => {
      if (pendingRef.current) return undefined
      pendingRef.current = key
      setPending(key)
      setError('')
      try {
        const result = await action()
        if (options.success) toast.success(options.success)
        return result
      } catch (cause) {
        const message = toErrorMessage(cause)
        setError(message)
        if (options.failure !== false) toast.error(options.failure ?? '操作失败', { description: message })
        return undefined
      } finally {
        pendingRef.current = null
        setPending(null)
      }
    },
    [],
  )

  const clearError = useCallback(() => setError(''), [])

  return { run, pending, busy: pending !== null, error, clearError }
}
