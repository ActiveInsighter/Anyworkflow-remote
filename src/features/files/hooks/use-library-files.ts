import { useEffect, useRef, useState } from 'react'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api/errors'
import { listLibraryFilePage, listLibraryFiles } from '@/lib/api/library-files'
import { useSession } from '@/lib/api/session'

export function useLibraryFiles(query = '') {
  const session = useSession()
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState('')
  const moreController = useRef<AbortController | null>(null)
  useEffect(() => {
    setMoreError('')
    return () => { moreController.current?.abort() }
  }, [query])
  const state = useAsyncData(signal => listLibraryFiles(signal, query), [session?.baseUrl, session?.record.id, query], {
    enabled: Boolean(session), errorMessage: toErrorMessage,
  })

  async function loadMore() {
    if (loadingMore || state.refreshing || !state.data?.cursor) return
    const controller = new AbortController()
    moreController.current = controller
    setLoadingMore(true)
    setMoreError('')
    try {
      const next = await listLibraryFilePage(state.data.cursor, controller.signal, query)
      if (controller.signal.aborted) return
      state.setData(current => ({ ...current, unavailable: current?.unavailable ?? 0, items: [...new Map([...(current?.items ?? []), ...next.items].map(file => [file.id, file])).values()], cursor: next.cursor }))
    } catch (error) { if (!controller.signal.aborted) setMoreError(toErrorMessage(error)) }
    finally { setLoadingMore(false) }
  }

  return { ...state, loadMore, loadingMore, moreError }
}
