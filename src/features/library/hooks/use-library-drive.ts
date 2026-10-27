import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useDriveLocation } from '@/components/drive/use-drive-location'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api'
import {
  createLibraryFolder,
  deleteLibraryFolder,
  deleteRunFavorite,
  deleteWorkflowTemplate,
  duplicateWorkflowTemplate,
  listLibrary,
  moveRunFavorite,
  updateLibraryFolder,
  updateWorkflowTemplate,
} from '@/lib/api/library'
import { useSession } from '@/lib/api/session'
import type { LibraryFolderRecord, LibraryFolderScope, RunFavoriteRecord, WorkflowTemplateRecord } from '@/types'

export type LibraryTab = 'favorites' | 'templates'

/**
 * Favorites and templates, each a folder tree of its own. The tab and the open folder live in
 * the URL; mutations report with a toast and reload, and throw so the open sheet can show why.
 */
export function useLibraryDrive() {
  const session = useSession()
  const navigate = useNavigate()
  const location = useDriveLocation()
  const tab: LibraryTab = location.params.get('tab') === 'templates' ? 'templates' : 'favorites'
  const scope: LibraryFolderScope = tab === 'favorites' ? 'favorite' : 'template'

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
  const favorites = useMemo(() => data?.favorites ?? [], [data?.favorites])
  const templates = useMemo(() => data?.templates ?? [], [data?.templates])
  const current = folders.some((folder) => folder.id === location.folder) ? location.folder : ''

  async function write(work: () => Promise<unknown>, success: string) {
    await work()
    await state.reload()
    toast.success(success)
  }

  return {
    session,
    state,
    location,
    tab,
    scope,
    folders,
    favorites,
    templates,
    current,
    changeTab: (next: LibraryTab) => location.replaceParam('tab', next === 'templates' ? 'templates' : null),
    createFolder: (name: string, parent: string) => write(() => createLibraryFolder(name, scope, parent), '文件夹已创建'),
    renameFolder: (folder: LibraryFolderRecord, name: string) => write(() => updateLibraryFolder(folder.id, { name }), '已重命名'),
    moveFolder: (folder: LibraryFolderRecord, parent: string) => write(() => updateLibraryFolder(folder.id, { parent }), '已移动'),
    deleteFolder: (folder: LibraryFolderRecord) => write(() => deleteLibraryFolder(folder.id, scope), '文件夹已删除'),
    moveFavorite: (item: RunFavoriteRecord, folder: string) => write(() => moveRunFavorite(item.id, folder), '已移动'),
    removeFavorite: (item: RunFavoriteRecord) =>
      write(() => deleteRunFavorite(item.id), '已取消收藏').catch((cause) => toast.error('取消收藏失败', { description: toErrorMessage(cause) })),
    renameTemplate: (item: WorkflowTemplateRecord, title: string) => write(() => updateWorkflowTemplate(item.id, { title }), '已重命名'),
    moveTemplate: (item: WorkflowTemplateRecord, folder: string) => write(() => updateWorkflowTemplate(item.id, { folder }), '已移动'),
    deleteTemplate: (item: WorkflowTemplateRecord) => write(() => deleteWorkflowTemplate(item.id), '模板已删除'),
    duplicateTemplate: (item: WorkflowTemplateRecord) =>
      duplicateWorkflowTemplate(item).then(
        (copy) => {
          toast.success('已创建副本')
          navigate(`/templates/${copy.id}`)
        },
        (cause) => toast.error('创建副本失败', { description: toErrorMessage(cause) }),
      ),
  }
}

export type LibraryDrive = ReturnType<typeof useLibraryDrive>
