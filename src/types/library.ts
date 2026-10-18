/** Library records: folders, Run favorites and workflow templates. */
import type { DispatchRunRecord } from './dispatch'

export type LibraryFolderScope = 'favorite' | 'template'

export interface LibraryFolderRecord {
  id: string
  owner: string
  parent: string
  name: string
  scope: LibraryFolderScope | ''
  sortOrder: number
  created: string
  updated: string
}

export interface RunFavoriteRecord {
  id: string
  owner: string
  folder: string
  run: string
  note: string
  sortOrder: number
  created: string
  updated: string
  runRecord?: DispatchRunRecord
  folderRecord?: LibraryFolderRecord
}

export interface WorkflowTemplateRecord {
  id: string
  owner: string
  folder: string
  title: string
  description: string
  planText: string
  sourceRun: string
  tags: string[]
  sortOrder: number
  created: string
  updated: string
  folderRecord?: LibraryFolderRecord
}

export interface FlattenedLibraryFolder extends LibraryFolderRecord {
  depth: number
  label: string
}
