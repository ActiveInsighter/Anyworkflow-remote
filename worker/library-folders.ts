import { UploadError, jsonResponse, methodNotAllowed } from './errors.js'
import type { PdfStorageEnv } from './pdf.js'

export const LIBRARY_FOLDERS_PATH = '/api/library/folders'
const FOLDER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const MAX_FOLDERS = 2000
const MAX_NAME = 120

export interface LibraryFolder {
  id: string
  name: string
  parent: string
  createdAt: string
  updatedAt: string
}

/** One object per folder, beside the owner's file index, so concurrent edits never collide. */
function folderKey(owner: string, id: string) { return `folders/${encodeURIComponent(owner)}/${id}` }
export function fileIndexPrefix(owner: string) { return `owners/${encodeURIComponent(owner)}/` }

export function cleanName(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string') throw new UploadError(`${label}无效`, 400, 'INVALID_NAME')
  const name = value.replace(/[\x00-\x1f\x7f]/gu, '').replace(/[/\\]/gu, '_').trim()
  if (!name) throw new UploadError(`${label}不能为空`, 400, 'INVALID_NAME')
  if (name.length > maximum) throw new UploadError(`${label}过长`, 400, 'INVALID_NAME')
  return name
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') || 0)
  if (length > 16 * 1024) throw new UploadError('请求内容过大', 413, 'BODY_TOO_LARGE')
  let body: unknown
  try { body = await request.json() } catch { throw new UploadError('请求内容无效', 400, 'INVALID_BODY') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UploadError('请求内容无效', 400, 'INVALID_BODY')
  return body as Record<string, unknown>
}

export async function listFolders(env: PdfStorageEnv, owner: string): Promise<LibraryFolder[]> {
  const folders: LibraryFolder[] = []
  let cursor: string | undefined
  do {
    const page = await env.PDF_UPLOADS.list({ prefix: `folders/${encodeURIComponent(owner)}/`, limit: 1000, cursor, include: ['customMetadata'] })
    for (const object of page.objects) {
      const meta = object.customMetadata ?? {}
      if (!FOLDER_ID.test(meta.id ?? '')) continue
      folders.push({ id: meta.id, name: meta.name || '未命名文件夹', parent: meta.parent || '', createdAt: meta.createdAt || '', updatedAt: meta.updatedAt || meta.createdAt || '' })
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor && folders.length < MAX_FOLDERS)
  return folders
}

async function putFolder(env: PdfStorageEnv, owner: string, folder: LibraryFolder) {
  await env.PDF_UPLOADS.put(folderKey(owner, folder.id), '', { customMetadata: { ...folder } })
  return folder
}

/** A parent must exist and must not be the folder itself or one of its descendants. */
function assertParent(folders: LibraryFolder[], parent: string, self = '') {
  if (!parent) return
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  if (!byId.has(parent)) throw new UploadError('目标文件夹不存在', 404, 'FOLDER_NOT_FOUND')
  const seen = new Set<string>()
  for (let current = byId.get(parent); current && !seen.has(current.id); current = byId.get(current.parent)) {
    if (self && current.id === self) throw new UploadError('不能移动到自身或其子文件夹', 400, 'FOLDER_CYCLE')
    seen.add(current.id)
  }
}

export async function assertFolderExists(env: PdfStorageEnv, owner: string, folder: string) {
  if (!folder) return
  if (!FOLDER_ID.test(folder) || !await env.PDF_UPLOADS.head(folderKey(owner, folder))) {
    throw new UploadError('目标文件夹不存在', 404, 'FOLDER_NOT_FOUND')
  }
}

export async function folderCollection(request: Request, env: PdfStorageEnv, owner: string): Promise<Response> {
  const folders = await listFolders(env, owner)
  if (request.method === 'GET') return jsonResponse({ items: folders })
  const body = await readJson(request)
  const parent = typeof body.parent === 'string' ? body.parent : ''
  assertParent(folders, parent)
  if (folders.length >= MAX_FOLDERS) throw new UploadError('文件夹数量已达上限', 400, 'FOLDER_LIMIT')
  const now = new Date().toISOString()
  const folder = await putFolder(env, owner, { id: crypto.randomUUID(), name: cleanName(body.name, MAX_NAME, '文件夹名称'), parent, createdAt: now, updatedAt: now })
  return jsonResponse(folder, 201)
}

export async function folderItem(request: Request, env: PdfStorageEnv, owner: string, id: string): Promise<Response> {
  if (!FOLDER_ID.test(id)) throw new UploadError('文件夹不存在', 404, 'FOLDER_NOT_FOUND')
  if (request.method !== 'PATCH' && request.method !== 'DELETE') return methodNotAllowed('PATCH, DELETE')
  const folders = await listFolders(env, owner)
  const folder = folders.find(item => item.id === id)
  if (!folder) {
    if (request.method === 'DELETE') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    throw new UploadError('文件夹不存在', 404, 'FOLDER_NOT_FOUND')
  }
  if (request.method === 'PATCH') {
    const body = await readJson(request)
    const next = { ...folder, updatedAt: new Date().toISOString() }
    if (body.name !== undefined) next.name = cleanName(body.name, MAX_NAME, '文件夹名称')
    if (body.parent !== undefined) {
      if (typeof body.parent !== 'string') throw new UploadError('目标文件夹无效', 400, 'INVALID_BODY')
      assertParent(folders, body.parent, id)
      next.parent = body.parent
    }
    return jsonResponse(await putFolder(env, owner, next))
  }
  // Nothing is lost with a folder: its sub-folders and files move up one level.
  for (const child of folders.filter(item => item.parent === id)) {
    await putFolder(env, owner, { ...child, parent: folder.parent, updatedAt: new Date().toISOString() })
  }
  let cursor: string | undefined
  do {
    const page = await env.PDF_UPLOADS.list({ prefix: fileIndexPrefix(owner), limit: 1000, cursor, include: ['customMetadata'] })
    for (const object of page.objects) {
      if (object.customMetadata?.folder !== id) continue
      await env.PDF_UPLOADS.put(object.key, '', { customMetadata: { ...object.customMetadata, folder: folder.parent } })
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  await env.PDF_UPLOADS.delete(folderKey(owner, id))
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
