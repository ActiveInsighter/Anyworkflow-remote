import { useEffect, useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { deleteCrawlDocument, isCrawlJobActive, listCrawlDocuments, listCrawlJobs, type DocumentQuery } from '@/lib/api/crawl'
import type { CrawlDocument } from '@/types/crawl'

const ACTIVE_POLL_MS = 3_000
const IDLE_POLL_MS = 60_000
const SEARCH_DEBOUNCE_MS = 300

/** Jobs newest first, all or one page's; followed closely while any on screen is moving. */
export function useCrawlJobs({ target, revision }: { target?: string; revision: number }) {
  const [page, setPage] = useState(1)
  const jobs = useAsyncData((signal) => listCrawlJobs({ page, target }, signal), [page, target, revision], {
    pollMs: (data) => (data?.items.some(isCrawlJobActive) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  return { jobs, page, setPage }
}

/** Stored documents, filtered and paged; `revision` (a job finished) reloads them. */
export function useCrawlDocuments({ target, revision }: { target?: string; revision: number }) {
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState('')
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

  const filters: DocumentQuery = { page, target, category: category || undefined, search: query || undefined }
  const documents = useAsyncData((signal) => listCrawlDocuments(filters, signal), [page, target, category, query, revision], { pollMs: IDLE_POLL_MS })

  function chooseCategory(value: string) {
    setCategory(value)
    setPage(1)
  }

  async function remove(document: CrawlDocument): Promise<boolean> {
    const done = await action.run(
      `${document.id}:delete`,
      async () => {
        await deleteCrawlDocument(document)
        await documents.reload()
        return true
      },
      { success: '内容已删除', failure: '删除失败' },
    )
    return Boolean(done)
  }

  return { documents, page, setPage, category, chooseCategory, search, setSearch, filtered: Boolean(category || query), busy: action.busy, remove }
}
