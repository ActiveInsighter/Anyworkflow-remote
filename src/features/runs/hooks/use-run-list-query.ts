import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { RunListFilter } from '@/lib/api'
import { isRunListFilter } from '../components/run-list/run-filter-tabs'

const SEARCH_DEBOUNCE_MS = 300

function readPage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/**
 * Run list filter, page and search live in the URL (replace, never push), so a refresh or a
 * shared link restores the same view. The search box is debounced before it touches the URL.
 */
export function useRunListQuery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterParam = searchParams.get('filter')
  const filter: RunListFilter = isRunListFilter(filterParam) ? filterParam : 'all'
  const page = readPage(searchParams.get('page'))
  const query = searchParams.get('q')?.trim() || ''
  const [searchInput, setSearchInput] = useState(query)

  useEffect(() => setSearchInput(query), [query])

  useEffect(() => {
    const next = searchInput.trim()
    if (next === query) return
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (next) params.set('q', next)
      else params.delete('q')
      params.delete('page')
      setSearchParams(params, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput, query, searchParams, setSearchParams])

  function update(next: { filter?: RunListFilter; page?: number }) {
    const params = new URLSearchParams(searchParams)
    if (next.filter !== undefined) {
      if (next.filter === 'all') params.delete('filter')
      else params.set('filter', next.filter)
      params.delete('page')
    }
    if (next.page !== undefined) {
      if (next.page <= 1) params.delete('page')
      else params.set('page', String(next.page))
    }
    setSearchParams(params, { replace: true })
  }

  return {
    filter,
    page,
    query,
    searchInput,
    setSearchInput,
    setFilter: (value: RunListFilter) => update({ filter: value }),
    setPage: (value: number) => update({ page: value }),
  }
}
