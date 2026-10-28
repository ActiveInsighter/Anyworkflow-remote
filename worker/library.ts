import { readArchive, storedPdf } from './archive.js'
import { UploadError, jsonResponse, methodNotAllowed } from './errors.js'
import { assertFolderExists, cleanName, fileIndexPrefix, readJson } from './library-folders.js'
import type { PdfStorageEnv } from './pdf.js'

export const LIBRARY_PATH = '/api/library/files'
export const LIBRARY_SOURCE_PATH = '/api/library/sources'
const FILE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf$/u

function indexKey(owner: string, key: string) { return `${fileIndexPrefix(owner)}${key}` }

export function libraryEnv(request: Request, env: Env): PdfStorageEnv {
  return { ...env, PDF_UPLOADS: env.LIBRARY_FILES, PDF_PUBLIC_BASE_URL: `${new URL(request.url).origin}${LIBRARY_SOURCE_PATH}` }
}

export async function assertLibraryFileAvailable(bucket: R2Bucket, key: string): Promise<void> {
  if (await bucket.head(`deleted/${key}`)) throw new UploadError('文件已删除，请重新上传', 410, 'FILE_DELETED')
}

type IndexMeta = { id: string; fileName: string; size: string; createdAt: string; folder?: string; updatedAt?: string }

function fileEntry(env: PdfStorageEnv, key: string, fileName: string, size: number, createdAt: string, folder = '', updatedAt = createdAt) {
  return { id: key, sourceUrl: `${env.PDF_PUBLIC_BASE_URL}/${key}`, fileName, size, createdAt, updatedAt, folder, expiresAt: '' }
}

function indexEntry(env: PdfStorageEnv, meta: IndexMeta) {
  return fileEntry(env, meta.id, meta.fileName, Number(meta.size), meta.createdAt, meta.folder || '', meta.updatedAt || meta.createdAt)
}

/** One index object per file avoids lost updates when multiple tabs upload concurrently. */
export async function registerLibraryFile(env: PdfStorageEnv, owner: string, object: Pick<R2Object, 'key' | 'size' | 'uploaded'>, fileName: string) {
  const key = object.key
  const createdAt = object.uploaded.toISOString()
  await assertLibraryFileAvailable(env.PDF_UPLOADS, key)
  // A repeated complete keeps any rename or folder the file has received since.
  const existing = (await env.PDF_UPLOADS.head(indexKey(owner, key)))?.customMetadata as IndexMeta | undefined
  const meta: IndexMeta = existing?.id === key ? existing : { id: key, fileName, size: String(object.size), createdAt }
  if (!existing) await env.PDF_UPLOADS.put(indexKey(owner, key), '', { customMetadata: { ...meta } })
  // A delayed complete response must not resurrect a file deleted in another tab.
  if (await env.PDF_UPLOADS.head(`deleted/${key}`)) {
    await env.PDF_UPLOADS.delete([key, indexKey(owner, key)])
    throw new UploadError('文件已删除，请重新上传', 410, 'FILE_DELETED')
  }
  return indexEntry(env, meta)
}

export async function listLibraryFiles(request: Request, env: PdfStorageEnv, owner: string): Promise<Response> {
  const params = new URL(request.url).searchParams
  let cursor = params.get('cursor') || undefined
  const query = (params.get('q') || '').trim().toLocaleLowerCase()
  const limit = params.has('limit') ? Number(params.get('limit')) : 100
  if (cursor && cursor.length > 4096) throw new UploadError('分页信息无效', 400, 'INVALID_CURSOR')
  if (query.length > 255) throw new UploadError('搜索内容过长', 400, 'INVALID_QUERY')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new UploadError('分页大小无效', 400, 'INVALID_LIMIT')
  // Search continues beyond the first page. Bound each request; the cursor can resume a sparse search.
  for (let scanned = 0; ; scanned++) {
    const result = await env.PDF_UPLOADS.list({ prefix: fileIndexPrefix(owner), limit, cursor, include: ['customMetadata'] })
    const items = result.objects
      .filter(object => !query || object.customMetadata!.fileName.toLocaleLowerCase().includes(query))
      .map(object => indexEntry(env, object.customMetadata as IndexMeta))
    cursor = result.truncated ? result.cursor : undefined
    if (!query || items.length || !cursor || scanned >= 9) return jsonResponse({ items, cursor: cursor || '' })
  }
}

export async function libraryFile(request: Request, env: PdfStorageEnv, owner: string, key: string): Promise<Response> {
  if (!FILE_ID.test(key)) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  const object = await env.PDF_UPLOADS.head(key) || await readArchive(env.PDF_UPLOADS, key)
  if (object && object.customMetadata?.owner !== owner) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  if (request.method === 'GET' || request.method === 'PATCH') {
    if (!object) throw new UploadError('文件已删除或不存在', 404, 'FILE_NOT_FOUND')
    await assertLibraryFileAvailable(env.PDF_UPLOADS, key)
    // The index carries the editable name and folder; the stored object keeps its upload name.
    const index = await env.PDF_UPLOADS.head(indexKey(owner, key))
    const meta: IndexMeta = { id: key, fileName: object.customMetadata!.fileName, size: String(object.size), createdAt: 'v' in object ? object.uploaded : object.uploaded.toISOString(), ...index?.customMetadata }
    if (request.method === 'GET') return jsonResponse(indexEntry(env, meta))
    const body = await readJson(request)
    if (body.fileName !== undefined) meta.fileName = cleanName(body.fileName, 240, '文件名')
    if (body.folder !== undefined) {
      if (typeof body.folder !== 'string') throw new UploadError('目标文件夹无效', 400, 'INVALID_BODY')
      await assertFolderExists(env, owner, body.folder)
      meta.folder = body.folder
    }
    meta.updatedAt = new Date().toISOString()
    await env.PDF_UPLOADS.put(indexKey(owner, key), '', { customMetadata: { ...meta } })
    if (await env.PDF_UPLOADS.head(`deleted/${key}`)) {
      await env.PDF_UPLOADS.delete(indexKey(owner, key))
      throw new UploadError('文件已删除', 410, 'FILE_DELETED')
    }
    return jsonResponse(indexEntry(env, meta))
  }
  if (request.method !== 'DELETE') return methodNotAllowed('GET, PATCH, DELETE')
  // Missing files are idempotent only for an owner's known index/tombstone.
  if (!object) {
    const tombstone = await env.PDF_UPLOADS.head(`deleted/${key}`)
    if (tombstone?.customMetadata?.owner !== owner) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  }
  await env.PDF_UPLOADS.put(`deleted/${key}`, '', { customMetadata: { owner } })
  await env.PDF_UPLOADS.delete([key, indexKey(owner, key)])
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

/** Unguessable capability URLs let Actions and OCR fetch the same source across jobs. */
export async function librarySource(request: Request, env: Env, key: string, ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD')
  if (!FILE_ID.test(key)) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  await assertLibraryFileAvailable(env.LIBRARY_FILES, key)
  return storedPdf(request, env, env.LIBRARY_FILES, key, ctx)
}
