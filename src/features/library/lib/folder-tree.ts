import type { LibraryFolderRecord, RunFavoriteRecord, WorkflowTemplateRecord } from '@/types'

export function folderSort(a: LibraryFolderRecord, b: LibraryFolderRecord) {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN')
}

/** Ancestors of `folderId`, root first, ending with the folder itself. Cycle-safe. */
export function folderPath(folderId: string, folders: readonly LibraryFolderRecord[]): LibraryFolderRecord[] {
  if (!folderId) return []
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: LibraryFolderRecord[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return path
}

/** Direct children of `parentId`; at the root, orphans and self-parented folders count as top level. */
export function childFolders(parentId: string, folders: readonly LibraryFolderRecord[]): LibraryFolderRecord[] {
  const ids = new Set(folders.map((folder) => folder.id))
  return folders
    .filter((folder) =>
      parentId ? folder.parent === parentId : !folder.parent || folder.parent === folder.id || !ids.has(folder.parent),
    )
    .slice()
    .sort(folderSort)
}

/** Whether `folderId` may be moved under `candidateId` without creating a cycle. */
export function canMoveInto(folderId: string, candidateId: string, folders: readonly LibraryFolderRecord[]): boolean {
  if (!candidateId) return true
  if (candidateId === folderId) return false
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const seen = new Set<string>()
  let current = byId.get(candidateId)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.parent === folderId) return false
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return true
}

const matches = (needle: string, parts: string[]) => parts.join(' ').toLocaleLowerCase().includes(needle)

/** Items in the current folder, or across all folders while searching. */
export function filterFavorites(items: readonly RunFavoriteRecord[], folder: string, needle: string) {
  return items.filter((item) =>
    needle
      ? matches(needle, [item.runRecord?.title || '', item.note, item.folderRecord?.name || ''])
      : item.folder === folder,
  )
}

export function filterTemplates(items: readonly WorkflowTemplateRecord[], folder: string, needle: string) {
  return items.filter((item) =>
    needle
      ? matches(needle, [item.title, item.description, item.tags.join(' '), item.folderRecord?.name || ''])
      : item.folder === folder,
  )
}
