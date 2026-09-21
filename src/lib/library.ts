import {
  DEFAULT_PAGE_SIZE,
  LIBRARY_FOLDER_COLLECTION,
  MAX_PLAN_TEXT_BYTES,
  MAX_TITLE_LENGTH,
  RUN_FAVORITE_COLLECTION,
  TEMPLATE_COLLECTION,
} from '@/lib/config'
import { ApiError, assertOwner, collectPages, listOwnedCollection, quoteFilter, request } from '@/lib/pocketbase'
import { otherScope, scopedFolders } from './library-tree'
import { requireSession } from '@/lib/session'
import type {
  DispatchRunRecord,
  LibraryFolderRecord,
  LibraryFolderScope,
  PocketBaseListResponse,
  RunFavoriteRecord,
  WorkflowTemplateRecord,
} from '@/types'

export { flattenLibraryFolders } from './library-tree'

type ExpandedFavorite = RunFavoriteRecord & {
  expand?: {
    run?: DispatchRunRecord
    folder?: LibraryFolderRecord
  }
}

type ExpandedTemplate = WorkflowTemplateRecord & {
  expand?: {
    folder?: LibraryFolderRecord
  }
}

function requiredId(value: string, label: string): string {
  const result = value.trim()
  if (!result || result.length > 240) throw new ApiError(`${label}无效`, 400, 'INVALID_LIBRARY_INPUT')
  return result
}

function optionalId(value: string): string {
  const result = value.trim()
  if (result.length > 240) throw new ApiError('ID 无效', 400, 'INVALID_LIBRARY_INPUT')
  return result
}

function bounded(value: string, maximum: number, label: string, required = false): string {
  const result = value.trim()
  if (required && !result) throw new ApiError(`${label}不能为空`, 400, 'INVALID_LIBRARY_INPUT')
  if (result.length > maximum) throw new ApiError(`${label}过长`, 400, 'INVALID_LIBRARY_INPUT')
  return result
}

function validatePlanText(value: string): string {
  if (!value.trim() || new TextEncoder().encode(value).byteLength > MAX_PLAN_TEXT_BYTES) {
    throw new ApiError('模板计划无效或超过 2 MiB', 400, 'INVALID_LIBRARY_INPUT')
  }
  return value
}

function normalizeTags(tags: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of tags) {
    const tag = item.trim()
    if (!tag || seen.has(tag)) continue
    if (tag.length > 64) throw new ApiError('标签过长', 400, 'INVALID_LIBRARY_INPUT')
    seen.add(tag)
    result.push(tag)
  }
  if (result.length > 20) throw new ApiError('标签过多', 400, 'INVALID_LIBRARY_INPUT')
  return result
}

function parseFolder(value: LibraryFolderRecord): LibraryFolderRecord {
  return assertOwner({
    ...value,
    parent: value.parent || '',
    scope: value.scope || '',
    sortOrder: Number(value.sortOrder || 0),
  })
}

function parseFavorite(value: ExpandedFavorite): RunFavoriteRecord {
  const favorite = assertOwner({
    ...value,
    folder: value.folder || '',
    note: value.note || '',
    sortOrder: Number(value.sortOrder || 0),
  })
  const runRecord = value.expand?.run ? assertOwner(value.expand.run) : undefined
  const folderRecord = value.expand?.folder ? parseFolder(value.expand.folder) : undefined
  if (runRecord && runRecord.id !== favorite.run) throw new ApiError('收藏 Run 关联无效', 502, 'INVALID_API_RESPONSE')
  if (folderRecord && folderRecord.id !== favorite.folder) throw new ApiError('收藏目录关联无效', 502, 'INVALID_API_RESPONSE')
  return { ...favorite, runRecord, folderRecord }
}

function parseTemplate(value: ExpandedTemplate): WorkflowTemplateRecord {
  const template = assertOwner({
    ...value,
    folder: value.folder || '',
    sourceRun: value.sourceRun || '',
    description: value.description || '',
    tags: Array.isArray(value.tags) ? value.tags.filter((item): item is string => typeof item === 'string') : [],
    sortOrder: Number(value.sortOrder || 0),
  })
  const folderRecord = value.expand?.folder ? parseFolder(value.expand.folder) : undefined
  if (folderRecord && folderRecord.id !== template.folder) throw new ApiError('模板目录关联无效', 502, 'INVALID_API_RESPONSE')
  return { ...template, folderRecord }
}

async function listFoldersPage(page: number): Promise<PocketBaseListResponse<LibraryFolderRecord>> {
  const session = requireSession()
  return listOwnedCollection(LIBRARY_FOLDER_COLLECTION, {
    page,
    perPage: DEFAULT_PAGE_SIZE,
    sort: '+sortOrder,+name',
    filter: `owner="${quoteFilter(session.record.id)}"`,
  }, parseFolder)
}

async function listFavoritesPage(page: number, extraFilter = ''): Promise<PocketBaseListResponse<RunFavoriteRecord>> {
  const session = requireSession()
  const filter = [`owner="${quoteFilter(session.record.id)}"`, extraFilter].filter(Boolean).join(' && ')
  return listOwnedCollection<ExpandedFavorite, RunFavoriteRecord>(RUN_FAVORITE_COLLECTION, {
    page,
    perPage: DEFAULT_PAGE_SIZE,
    sort: '-updated',
    expand: 'run,folder',
    filter,
  }, parseFavorite)
}

async function listTemplatesPage(page: number): Promise<PocketBaseListResponse<WorkflowTemplateRecord>> {
  const session = requireSession()
  return listOwnedCollection<ExpandedTemplate, WorkflowTemplateRecord>(TEMPLATE_COLLECTION, {
    page,
    perPage: DEFAULT_PAGE_SIZE,
    sort: '-updated',
    expand: 'folder',
    filter: `owner="${quoteFilter(session.record.id)}"`,
  }, parseTemplate)
}

export async function listAllLibraryFolders(): Promise<LibraryFolderRecord[]> {
  const first = await listFoldersPage(1)
  return collectPages(first, listFoldersPage)
}

export async function listAllRunFavorites(): Promise<RunFavoriteRecord[]> {
  const first = await listFavoritesPage(1)
  return collectPages(first, listFavoritesPage)
}

export async function listAllWorkflowTemplates(): Promise<WorkflowTemplateRecord[]> {
  const first = await listTemplatesPage(1)
  return collectPages(first, listTemplatesPage)
}

export async function listLibrary() {
  const [folders, favorites, templates] = await Promise.all([
    listAllLibraryFolders(),
    listAllRunFavorites(),
    listAllWorkflowTemplates(),
  ])
  return {
    folders,
    favoriteFolders: scopedFolders(folders, 'favorite', favorites.map((item) => item.folder)),
    templateFolders: scopedFolders(folders, 'template', templates.map((item) => item.folder)),
    favorites,
    templates,
  }
}

export async function getRunFavoriteForRun(runId: string): Promise<RunFavoriteRecord | null> {
  const first = await listFavoritesPage(1, `run="${quoteFilter(requiredId(runId, 'Run ID'))}"`)
  if (first.totalItems > 1) throw new ApiError('同一个 Run 存在重复收藏', 502, 'INVALID_API_RESPONSE')
  return first.items[0] ?? null
}

export async function createRunFavorite(runId: string, folder = ''): Promise<RunFavoriteRecord> {
  const session = requireSession()
  const response = await request<ExpandedFavorite>(`/api/collections/${RUN_FAVORITE_COLLECTION}/records`, {
    method: 'POST',
    data: {
      owner: session.record.id,
      folder: optionalId(folder),
      run: requiredId(runId, 'Run ID'),
      note: '',
      sortOrder: 0,
    },
  })
  return parseFavorite(response)
}

export async function moveRunFavorite(id: string, folder = ''): Promise<RunFavoriteRecord> {
  return parseFavorite(await request<ExpandedFavorite>(
    `/api/collections/${RUN_FAVORITE_COLLECTION}/records/${encodeURIComponent(requiredId(id, '收藏 ID'))}`,
    { method: 'PATCH', data: { folder: optionalId(folder) } },
  ))
}

export async function deleteRunFavorite(id: string): Promise<void> {
  await request<void>(
    `/api/collections/${RUN_FAVORITE_COLLECTION}/records/${encodeURIComponent(requiredId(id, '收藏 ID'))}`,
    { method: 'DELETE' },
  )
}

export async function createLibraryFolder(
  name: string,
  scope: LibraryFolderScope,
  parent = '',
): Promise<LibraryFolderRecord> {
  const session = requireSession()
  return parseFolder(await request<LibraryFolderRecord>(`/api/collections/${LIBRARY_FOLDER_COLLECTION}/records`, {
    method: 'POST',
    data: {
      owner: session.record.id,
      parent: optionalId(parent),
      name: bounded(name, 120, '目录名称', true),
      scope,
      sortOrder: 0,
    },
  }))
}

export async function updateLibraryFolder(
  id: string,
  input: { name?: string; parent?: string },
): Promise<LibraryFolderRecord> {
  const data: Record<string, string> = {}
  if (input.name !== undefined) data.name = bounded(input.name, 120, '目录名称', true)
  if (input.parent !== undefined) data.parent = optionalId(input.parent)
  return parseFolder(await request<LibraryFolderRecord>(
    `/api/collections/${LIBRARY_FOLDER_COLLECTION}/records/${encodeURIComponent(requiredId(id, '目录 ID'))}`,
    { method: 'PATCH', data },
  ))
}

/**
 * Deleting a folder never orphans anything: child folders move to the root and filed items fall
 * back to 未分类. `scope` narrows that cleanup to the tab the folder belongs to, so removing a
 * 收藏 directory cannot detach a 模板 that happens to sit in it.
 */
export async function deleteLibraryFolder(id: string, scope?: LibraryFolderScope): Promise<void> {
  const folderId = requiredId(id, '目录 ID')
  const foreignScope = otherScope(scope)
  const library = await listLibrary()
  for (const child of library.folders.filter((folder) => folder.parent === folderId && folder.scope !== foreignScope)) {
    await updateLibraryFolder(child.id, { parent: '' })
  }
  if (scope !== 'template') {
    for (const favorite of library.favorites.filter((item) => item.folder === folderId)) {
      await moveRunFavorite(favorite.id, '')
    }
  }
  if (scope !== 'favorite') {
    for (const template of library.templates.filter((item) => item.folder === folderId)) {
      await updateWorkflowTemplate(template.id, { folder: '' })
    }
  }
  await request<void>(
    `/api/collections/${LIBRARY_FOLDER_COLLECTION}/records/${encodeURIComponent(folderId)}`,
    { method: 'DELETE' },
  )
}

export interface CreateTemplateInput {
  title: string
  description?: string
  planText: string
  folder?: string
  sourceRun?: string
  tags?: string[]
}

export async function createWorkflowTemplate(input: CreateTemplateInput): Promise<WorkflowTemplateRecord> {
  const session = requireSession()
  const response = await request<ExpandedTemplate>(`/api/collections/${TEMPLATE_COLLECTION}/records`, {
    method: 'POST',
    data: {
      owner: session.record.id,
      folder: optionalId(input.folder ?? ''),
      title: bounded(input.title, MAX_TITLE_LENGTH, '模板名称', true),
      description: bounded(input.description ?? '', 4096, '模板描述'),
      planText: validatePlanText(input.planText),
      sourceRun: optionalId(input.sourceRun ?? ''),
      tags: normalizeTags(input.tags ?? []),
      sortOrder: 0,
    },
  })
  return parseTemplate(response)
}

export async function createWorkflowTemplateFromRun(
  run: Pick<DispatchRunRecord, 'id' | 'owner' | 'title' | 'planText'>,
): Promise<WorkflowTemplateRecord> {
  const session = requireSession()
  if (run.owner !== session.record.id) throw new ApiError('当前 Run 不属于登录账号', 403, 'INVALID_RECORD_OWNER')
  return createWorkflowTemplate({
    title: run.title || '未命名模板',
    planText: run.planText,
    sourceRun: run.id,
  })
}

export async function getWorkflowTemplate(id: string): Promise<WorkflowTemplateRecord> {
  return parseTemplate(await request<ExpandedTemplate>(
    `/api/collections/${TEMPLATE_COLLECTION}/records/${encodeURIComponent(requiredId(id, '模板 ID'))}`,
    { query: { expand: 'folder' } },
  ))
}

export async function updateWorkflowTemplate(
  id: string,
  input: Partial<Pick<WorkflowTemplateRecord, 'title' | 'description' | 'planText' | 'folder' | 'tags'>>,
): Promise<WorkflowTemplateRecord> {
  const data: Record<string, unknown> = {}
  if (input.title !== undefined) data.title = bounded(input.title, MAX_TITLE_LENGTH, '模板名称', true)
  if (input.description !== undefined) data.description = bounded(input.description, 4096, '模板描述')
  if (input.planText !== undefined) data.planText = validatePlanText(input.planText)
  if (input.folder !== undefined) data.folder = optionalId(input.folder)
  if (input.tags !== undefined) data.tags = normalizeTags(input.tags)

  return parseTemplate(await request<ExpandedTemplate>(
    `/api/collections/${TEMPLATE_COLLECTION}/records/${encodeURIComponent(requiredId(id, '模板 ID'))}`,
    { method: 'PATCH', data },
  ))
}

export async function duplicateWorkflowTemplate(template: WorkflowTemplateRecord): Promise<WorkflowTemplateRecord> {
  const suffix = '（副本）'
  const base = template.title.endsWith(suffix) ? template.title.slice(0, -suffix.length).trim() : template.title
  return createWorkflowTemplate({
    title: `${base.slice(0, Math.max(1, MAX_TITLE_LENGTH - suffix.length))}${suffix}`,
    description: template.description,
    planText: template.planText,
    folder: template.folder,
    sourceRun: template.sourceRun,
    tags: template.tags,
  })
}

export async function deleteWorkflowTemplate(id: string): Promise<void> {
  await request<void>(
    `/api/collections/${TEMPLATE_COLLECTION}/records/${encodeURIComponent(requiredId(id, '模板 ID'))}`,
    { method: 'DELETE' },
  )
}
