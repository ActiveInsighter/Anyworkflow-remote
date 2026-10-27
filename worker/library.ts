import { UploadError, jsonResponse, methodNotAllowed } from './errors.js'
import type { PdfStorageEnv } from './pdf.js'

export const LIBRARY_PATH = '/api/library/files'
export const LIBRARY_SOURCE_PATH = '/api/library/sources'
const FILE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf$/u

function indexKey(owner: string, key: string) { return `owners/${encodeURIComponent(owner)}/${key}` }

export function libraryEnv(request: Request, env: Env): PdfStorageEnv {
  return { ...env, PDF_UPLOADS: env.LIBRARY_FILES, PDF_PUBLIC_BASE_URL: `${new URL(request.url).origin}${LIBRARY_SOURCE_PATH}` }
}

export async function assertLibraryFileAvailable(bucket: R2Bucket, key: string): Promise<void> {
  if (await bucket.head(`deleted/${key}`)) throw new UploadError('文件已删除，请重新上传', 410, 'FILE_DELETED')
}

function fileEntry(env: PdfStorageEnv, key: string, fileName: string, size: number, createdAt: string) {
  return { id: key, sourceUrl: `${env.PDF_PUBLIC_BASE_URL}/${key}`, fileName, size, createdAt, expiresAt: '' }
}

/** One index object per file avoids lost updates when multiple tabs upload concurrently. */
export async function registerLibraryFile(env: PdfStorageEnv, owner: string, object: R2Object, fileName: string) {
  const key = object.key
  const createdAt = object.uploaded.toISOString()
  await assertLibraryFileAvailable(env.PDF_UPLOADS, key)
  await env.PDF_UPLOADS.put(indexKey(owner, key), '', {
    customMetadata: { id: key, fileName, size: String(object.size), createdAt },
  })
  // A delayed complete response must not resurrect a file deleted in another tab.
  if (await env.PDF_UPLOADS.head(`deleted/${key}`)) {
    await env.PDF_UPLOADS.delete([key, indexKey(owner, key)])
    throw new UploadError('文件已删除，请重新上传', 410, 'FILE_DELETED')
  }
  return fileEntry(env, key, fileName, object.size, createdAt)
}

export async function listLibraryFiles(request: Request, env: PdfStorageEnv, owner: string): Promise<Response> {
  const params = new URL(request.url).searchParams
  let cursor = params.get('cursor') || undefined
  const query = (params.get('q') || '').trim().toLocaleLowerCase()
  if (cursor && cursor.length > 4096) throw new UploadError('分页信息无效', 400, 'INVALID_CURSOR')
  if (query.length > 255) throw new UploadError('搜索内容过长', 400, 'INVALID_QUERY')
  // Search continues beyond the first page. Bound each request; the cursor can resume a sparse search.
  for (let scanned = 0; ; scanned++) {
    const result = await env.PDF_UPLOADS.list({ prefix: `owners/${encodeURIComponent(owner)}/`, limit: 100, cursor, include: ['customMetadata'] })
    const items = result.objects.filter(object => !query || object.customMetadata!.fileName.toLocaleLowerCase().includes(query)).map(object => {
      const meta = object.customMetadata!
      return fileEntry(env, meta.id, meta.fileName, Number(meta.size), meta.createdAt)
    })
    cursor = result.truncated ? result.cursor : undefined
    if (!query || items.length || !cursor || scanned >= 9) return jsonResponse({ items, cursor: cursor || '' })
  }
}

export async function libraryFile(request: Request, env: PdfStorageEnv, owner: string, key: string): Promise<Response> {
  if (!FILE_ID.test(key)) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  const object = await env.PDF_UPLOADS.head(key)
  if (object && object.customMetadata?.owner !== owner) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  if (request.method === 'GET') {
    if (!object) throw new UploadError('文件已删除或不存在', 404, 'FILE_NOT_FOUND')
    await assertLibraryFileAvailable(env.PDF_UPLOADS, key)
    return jsonResponse(fileEntry(env, key, object.customMetadata!.fileName, object.size, object.uploaded.toISOString()))
  }
  if (request.method !== 'DELETE') return methodNotAllowed('GET, DELETE')
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
export async function librarySource(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD')
  if (!FILE_ID.test(key)) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  await assertLibraryFileAvailable(env.LIBRARY_FILES, key)
  const meta = await env.LIBRARY_FILES.head(key)
  if (!meta) throw new UploadError('文件已删除或不存在', 404, 'FILE_NOT_FOUND')
  let range: { offset: number; length: number } | undefined
  const rangeHeader = request.method === 'GET' && (!request.headers.has('If-Range') || request.headers.get('If-Range') === meta.httpEtag) ? request.headers.get('Range') : null
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader)
    if (match && (match[1] || match[2])) {
      const offset = match[1] ? Number(match[1]) : Math.max(0, meta.size - Number(match[2]))
      const end = match[1] && match[2] ? Math.min(meta.size - 1, Number(match[2])) : meta.size - 1
      if (Number.isSafeInteger(offset) && Number.isSafeInteger(end) && offset >= 0 && offset < meta.size && end >= offset && (match[1] || Number(match[2]) > 0)) range = { offset, length: end - offset + 1 }
    }
    if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}`, 'Cache-Control': 'no-store' } })
  }
  const headers = new Headers({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'ETag': meta.httpEtag, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
  headers.set('Content-Length', String(range?.length ?? meta.size))
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`)
  if (request.method === 'HEAD') return new Response(null, { headers })
  const object = await env.LIBRARY_FILES.get(key, { ...(range ? { range } : {}), onlyIf: { etagMatches: meta.etag } })
  if (!object || !('body' in object)) throw new UploadError('文件已删除或不存在', 404, 'FILE_NOT_FOUND')
  return new Response(object.body, { status: range ? 206 : 200, headers })
}
