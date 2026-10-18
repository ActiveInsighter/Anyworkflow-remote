import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toErrorMessage } from '@/lib/api'

/** Resolve a target URL once, then replace the current history entry with it. */
export function useRedirect(resolve: (() => Promise<string>) | null, key: string) {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!resolve) return
    let active = true
    resolve()
      .then((url) => {
        if (active) navigate(url, { replace: true })
      })
      .catch((cause: unknown) => {
        if (active) setError(toErrorMessage(cause))
      })
    return () => {
      active = false
    }
    // `key` identifies the target; `resolve` is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, navigate])

  return error
}
