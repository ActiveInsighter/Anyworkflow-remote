import { useEffect, useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { deleteCrawledContent, deleteCrawlRun, isCrawlRunActive, listCrawledContents, listCrawlRuns, type ContentQuery } from '@/lib/api/web-crawl'
import type { CrawledContent, CrawlRun } from '@/types/web-crawl'

const ACTIVE_POLL_MS = 4_000
const IDLE_POLL_MS = 60_000
const SEARCH_DEBOUNCE_MS = 300

/** Stored contents, filtered and paged; `settled` (a run finished) reloads them. */
export function useCrawledContents({ target, settled }: { target?: string; settled: number }) {
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const action = useAsyncAction()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  const filters: ContentQuery = { page, target, type: type || undefined, search: query || undefined }
  const contents = useAsyncData((signal) => listCrawledContents(filters, signal), [page, target, type, query, settled], { pollMs: IDLE_POLL_MS })

  function chooseType(value: string) {
    setType(value)
    setPage(1)
  }

  async function remove(content: CrawledContent): Promise<boolean> {
    const done = await action.run(
      `${content.id}:delete`,
      async () => {
        await deleteCrawledContent(content)
        await contents.reload()
        return true
      },
      { success: '内容已删除', failure: '删除失败' },
    )
    return Boolean(done)
  }

  return { contents, page, setPage, type, chooseType, search, setSearch, filtered: Boolean(type || query), busy: action.busy, remove }
}

/** Crawl history, newest first; followed closely while any run on the page is active. */
export function useCrawlRuns({ settled }: { settled: number }) {
  const [page, setPage] = useState(1)
  const action = useAsyncAction()
  const runs = useAsyncData((signal) => listCrawlRuns(page, signal), [page, settled], {
    pollMs: (data) => (data?.items.some(isCrawlRunActive) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })

  async function remove(run: CrawlRun): Promise<boolean> {
    const done = await action.run(
      `${run.id}:delete`,
      async () => {
        await deleteCrawlRun(run)
        await runs.reload()
        return true
      },
      { success: '记录已删除', failure: '删除失败' },
    )
    return Boolean(done)
  }

  return { runs, page, setPage, busy: action.busy, pending: action.pending, remove }
}
