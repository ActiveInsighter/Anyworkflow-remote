import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api'
import { listLibrary } from '@/lib/api/library'
import { useSession } from '@/lib/api/session'
import type { LibraryFolderScope } from '@/types'
import { childFolders, filterFavorites, filterTemplates, folderPath } from '../lib/folder-tree'

export type LibraryTab = 'favorites' | 'templates'

/**
 * Library data plus the view state around it. Tab and folder live in the URL and replace the
 * current history entry; the search box is local and searches across every folder.
 */
export function useLibraryView() {
  const session = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: LibraryTab = searchParams.get('tab') === 'templates' ? 'templates' : 'favorites'
  const requestedFolder = searchParams.get('folder') || ''
  const [query, setQuery] = useState('')

  const state = useAsyncData(() => listLibrary(), [session?.record.id], {
    enabled: Boolean(session),
    staleMs: 15_000,
    cacheKey: session ? `library:${session.record.id}` : undefined,
    errorMessage: toErrorMessage,
  })
  const data = state.data

  const folders = useMemo(
    () => (tab === 'favorites' ? data?.favoriteFolders : data?.templateFolders) ?? [],
    [data?.favoriteFolders, data?.templateFolders, tab],
  )
  const currentFolder = folders.find((folder) => folder.id === requestedFolder)?.id || ''
  const needle = query.trim().toLocaleLowerCase()

  const path = useMemo(() => folderPath(currentFolder, folders), [currentFolder, folders])
  const children = useMemo(() => childFolders(currentFolder, folders), [currentFolder, folders])
  const favorites = useMemo(() => filterFavorites(data?.favorites ?? [], currentFolder, needle), [data?.favorites, currentFolder, needle])
  const templates = useMemo(() => filterTemplates(data?.templates ?? [], currentFolder, needle), [data?.templates, currentFolder, needle])

  /** Direct items and sub-folders inside `folderId`, for folder row meta. */
  function folderCounts(folderId: string) {
    const items = tab === 'favorites' ? (data?.favorites ?? []) : (data?.templates ?? [])
    return {
      items: items.filter((item) => item.folder === folderId).length,
      folders: folders.filter((folder) => folder.parent === folderId).length,
    }
  }

  function changeTab(next: LibraryTab) {
    const params = new URLSearchParams(searchParams)
    if (next === 'favorites') params.delete('tab')
    else params.set('tab', next)
    params.delete('folder')
    setQuery('')
    setSearchParams(params, { replace: true })
  }

  function openFolder(folder: string) {
    const params = new URLSearchParams(searchParams)
    if (folder) params.set('folder', folder)
    else params.delete('folder')
    setQuery('')
    setSearchParams(params, { replace: true })
  }

  return {
    session,
    state,
    tab,
    scope: (tab === 'favorites' ? 'favorite' : 'template') as LibraryFolderScope,
    folders,
    currentFolder,
    path,
    children,
    favorites,
    templates,
    query,
    setQuery,
    searching: Boolean(needle),
    folderCounts,
    changeTab,
    openFolder,
  }
}
