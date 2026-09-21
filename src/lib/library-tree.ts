import type { FlattenedLibraryFolder, LibraryFolderRecord, LibraryFolderScope } from '../types'

/**
 * The visible tree for one tab. Scoped folders are always visible; unscoped legacy folders stay
 * visible only when an item or descendant still references them.
 */
export function scopedFolders(
  folders: LibraryFolderRecord[],
  scope: LibraryFolderScope,
  referencedFolderIds: string[],
): LibraryFolderRecord[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const included = new Set(folders.filter((folder) => folder.scope === scope).map((folder) => folder.id))
  for (const id of referencedFolderIds.filter(Boolean)) {
    let current = id
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      const folder = byId.get(current)
      if (!folder) break
      if (!folder.scope || folder.scope === scope) included.add(folder.id)
      current = folder.parent
    }
  }
  return folders.filter((folder) => included.has(folder.id))
}

export function otherScope(scope?: LibraryFolderScope): LibraryFolderScope | undefined {
  if (scope === 'favorite') return 'template'
  if (scope === 'template') return 'favorite'
  return undefined
}

function compareFolders(a: LibraryFolderRecord, b: LibraryFolderRecord): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN')
}

export function flattenLibraryFolders(folders: LibraryFolderRecord[]): FlattenedLibraryFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const children = new Map<string, LibraryFolderRecord[]>()
  const roots: LibraryFolderRecord[] = []

  for (const folder of folders) {
    if (!folder.parent || !byId.has(folder.parent) || folder.parent === folder.id) {
      roots.push(folder)
      continue
    }
    const siblings = children.get(folder.parent) ?? []
    siblings.push(folder)
    children.set(folder.parent, siblings)
  }
  roots.sort(compareFolders)
  children.forEach((items) => items.sort(compareFolders))

  const result: FlattenedLibraryFolder[] = []
  const visited = new Set<string>()
  const visit = (folder: LibraryFolderRecord, depth: number) => {
    if (visited.has(folder.id)) return
    visited.add(folder.id)
    result.push({ ...folder, depth, label: folder.name })
    for (const child of children.get(folder.id) ?? []) visit(child, depth + 1)
  }
  roots.forEach((folder) => visit(folder, 0))
  folders.slice().sort(compareFolders).forEach((folder) => visit(folder, 0))
  return result
}
