import type { DriveEntry, DriveFolder, DriveSort } from './drive-types'

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

/** Folders first, then items; each group by the chosen field, ties broken by name. */
export function sortEntries(entries: readonly DriveEntry[], sort: DriveSort): DriveEntry[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  const byField = (a: DriveEntry, b: DriveEntry) => {
    if (sort.field === 'updated') return Date.parse(a.updated || '0') - Date.parse(b.updated || '0')
    if (sort.field === 'size') return (a.size ?? 0) - (b.size ?? 0)
    return 0
  }
  return entries.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return sign * (byField(a, b) || collator.compare(a.name, b.name))
  })
}

/** Ancestors of `folderId`, root first, ending with the folder itself. Cycle-safe. */
export function drivePath<T extends DriveFolder>(folderId: string, folders: readonly T[]): T[] {
  if (!folderId) return []
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: T[] = []
  const seen = new Set<string>()
  for (let current = byId.get(folderId); current && !seen.has(current.id); current = byId.get(current.parent)) {
    seen.add(current.id)
    path.unshift(current)
  }
  return path
}

/** Direct children of `parentId`; at the root, orphans and self-parented folders count as top level. */
export function driveChildren<T extends DriveFolder>(parentId: string, folders: readonly T[]): T[] {
  const ids = new Set(folders.map((folder) => folder.id))
  return folders.filter((folder) =>
    parentId
      ? folder.parent === parentId && folder.id !== parentId
      : !folder.parent || folder.parent === folder.id || !ids.has(folder.parent),
  )
}

/** Effective parent: missing or self parents count as the root. */
export function parentOf(folder: DriveFolder, folders: readonly DriveFolder[]): string {
  return folder.parent && folder.parent !== folder.id && folders.some((item) => item.id === folder.parent) ? folder.parent : ''
}

/** Whether `folderId` may move under `candidateId` without creating a cycle. */
export function canMoveFolderInto(folderId: string, candidateId: string, folders: readonly DriveFolder[]): boolean {
  if (!candidateId) return true
  return !drivePath(candidateId, folders).some((folder) => folder.id === folderId)
}
