import { useState } from 'react'
import { useSearchParams } from 'react-router'

/**
 * The open folder lives in `?folder=` and each folder opened is a history entry, so the back
 * button (browser or top bar) steps up the way it came. Search is local and spans every folder.
 */
export function useDriveLocation() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const folder = params.get('folder') || ''

  function openFolder(id: string) {
    const next = new URLSearchParams(params)
    if (id) next.set('folder', id)
    else next.delete('folder')
    setQuery('')
    if (id !== folder) setParams(next)
  }

  /** Change another parameter (a tab) and go back to its top level, replacing the entry. */
  function replaceParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    next.delete('folder')
    setQuery('')
    setParams(next, { replace: true })
  }

  return { folder, openFolder, query, setQuery, needle: query.trim().toLocaleLowerCase(), params, replaceParam }
}
