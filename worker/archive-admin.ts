import { UploadError, jsonResponse } from './errors.js'
import { readJson } from './pdf.js'
import { ARCHIVE_CHUNK_SIZE, PDF_FILE_ID, archiveBucket, archiveKey, chunkPath, validArchive, type ArchiveEnv } from './archive.js'

export const ARCHIVE_ADMIN_PATH = '/api/internal/pdf-archive'
const LEASE_KEY = 'archive-control/lease'
const pendingKey = (key: string) => `archive-pending/${key}.json`
const fail = (message: string, code = 'ARCHIVE_CONFLICT') => new UploadError(message, 409, code)

async function authenticate(request: Request, env: ArchiveEnv) {
  if (!env.ARCHIVE_ADMIN_SECRET || env.ARCHIVE_ADMIN_SECRET.length < 32) throw new UploadError('接口不存在', 404, 'NOT_FOUND')
  const given = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/iu)?.[1] || ''
  const bytes = new TextEncoder()
  const [a, b] = await Promise.all([given, env.ARCHIVE_ADMIN_SECRET].map(s => crypto.subtle.digest('SHA-256', bytes.encode(s))))
  if (!crypto.subtle.timingSafeEqual(a, b)) throw new UploadError('归档凭据无效', 401, 'AUTH_REQUIRED')
}

async function assertLease(request: Request, env: Env) {
  const lease = await env.LIBRARY_FILES.head(LEASE_KEY)
  if (!lease || lease.customMetadata?.token !== request.headers.get('X-Archive-Lease') || Number(lease.customMetadata?.expiresAt) <= Date.now()) throw fail('归档租约已失效', 'LEASE_LOST')
  return lease
}

/** Privileged CI bridge: no Cloudflare credentials or public asset paths in browser APIs. */
export async function archiveAdmin(request: Request, env: ArchiveEnv): Promise<Response> {
  await authenticate(request, env)
  const url = new URL(request.url)
  const action = url.pathname.slice(ARCHIVE_ADMIN_PATH.length)
  if (action === '/lease' && request.method === 'POST') {
    const previous = await env.LIBRARY_FILES.head(LEASE_KEY)
    if (previous && Number(previous.customMetadata?.expiresAt) > Date.now()) throw fail('已有归档任务运行', 'LEASE_BUSY')
    const token = crypto.randomUUID()
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000
    const result = await env.LIBRARY_FILES.put(LEASE_KEY, token, { onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' }, customMetadata: { token, expiresAt: String(expiresAt) } })
    if (!result) throw fail('已有归档任务运行', 'LEASE_BUSY')
    return jsonResponse({ token, expiresAt })
  }
  const lease = await assertLease(request, env)
  if (action === '/lease' && request.method === 'DELETE') {
    await env.LIBRARY_FILES.put(LEASE_KEY, crypto.randomUUID(), { onlyIf: { etagMatches: lease.etag }, customMetadata: { expiresAt: '0' } })
    return new Response(null, { status: 204 })
  }
  if (action === '/chunk' && request.method === 'GET') {
    const hash = url.searchParams.get('hash') || ''
    if (!/^[a-f0-9]{32}$/u.test(hash) || !env.PDF_ARCHIVE) throw new UploadError('归档资源不可用', 503, 'ARCHIVE_UNAVAILABLE')
    const response = await env.PDF_ARCHIVE.fetch(`https://archive.internal${chunkPath(hash)}`)
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  }
  const scope = url.searchParams.get('scope')
  if (scope !== 'library' && scope !== 'relay') throw new UploadError('归档存储范围无效', 400, 'INVALID_SCOPE')
  const bucket = archiveBucket(env, scope)
  if (action === '/candidates' && request.method === 'GET') {
    const listed = await bucket.list({ limit: 1000, cursor: url.searchParams.get('cursor') || undefined, include: ['customMetadata'] })
    return jsonResponse({ items: listed.objects.filter(o => PDF_FILE_ID.test(o.key) && o.uploaded.getTime() + 86400_000 <= Date.now()).map(o => ({ key: o.key, size: o.size, etag: o.etag, httpEtag: o.httpEtag, uploaded: o.uploaded.toISOString(), customMetadata: o.customMetadata || {} })), cursor: listed.truncated ? listed.cursor : '' })
  }
  if (action === '/records' && request.method === 'GET') {
    const prefix = url.searchParams.get('pending') === 'true' ? 'archive-pending/' : 'archives/'
    const listed = await bucket.list({ prefix, limit: 10, cursor: url.searchParams.get('cursor') || undefined })
    const items = []
    for (const o of listed.objects) {
      const stored = await bucket.get(o.key)
      if (!stored) continue
      const record: unknown = await stored.json()
      if (!validArchive(record) || record.scope !== scope) throw new UploadError('归档清单损坏，已停止发布', 502, 'INVALID_ARCHIVE')
      items.push(record)
    }
    return jsonResponse({ items, cursor: listed.truncated ? listed.cursor : '' })
  }
  const key = url.searchParams.get('key') || ''
  if (!PDF_FILE_ID.test(key)) throw new UploadError('归档文件编号无效', 400, 'INVALID_FILE_ID')
  if (action === '/source' && request.method === 'GET') {
    // Bound every read to one chunk. The runner cannot buffer a 2 GiB document in a Worker.
    const match = /^bytes=(\d+)-(\d+)$/u.exec(request.headers.get('Range') || '')
    if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < Number(match[1]) || Number(match[2]) - Number(match[1]) >= ARCHIVE_CHUNK_SIZE || !request.headers.get('If-Match')) throw new UploadError('归档读取范围无效', 400, 'INVALID_RANGE')
    const object = await bucket.get(key, { range: { offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 }, onlyIf: { etagMatches: request.headers.get('If-Match')!.replace(/^"|"$/gu, '') } })
    if (!object || !('body' in object)) throw fail('原文件已变化或删除')
    return new Response(object.body, { headers: { 'Content-Length': String(Math.min(Number(match[2]) - Number(match[1]) + 1, object.size - Number(match[1]))), ETag: object.httpEtag, 'Cache-Control': 'no-store' } })
  }
  if (action === '/stage' && request.method === 'POST') {
    const record: unknown = await readJson(request)
    if (!validArchive(record) || record.key !== key || record.scope !== scope) throw new UploadError('归档索引无效', 400, 'INVALID_ARCHIVE')
    const hot = await bucket.head(key)
    if (!hot || hot.etag !== record.etag || hot.size !== record.size || hot.uploaded.toISOString() !== record.uploaded || hot.uploaded.getTime() + 86400_000 > Date.now()) throw fail('原文件已变化或尚未到期')
    // Metadata is copied from R2, never trusted from the runner.
    record.customMetadata = hot.customMetadata || {}
    await bucket.put(pendingKey(key), JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } })
    return jsonResponse({ staged: true })
  }
  if (action === '/commit' && request.method === 'POST') {
    const stored = await bucket.get(pendingKey(key)) || await bucket.get(archiveKey(key))
    const record: unknown = stored ? await stored.json() : null
    if (!validArchive(record) || record.scope !== scope) throw fail('缺少已发布归档索引')
    const hot = await bucket.head(key)
    if (hot && (hot.etag !== record.etag || hot.size !== record.size)) throw fail('原文件已变化')
    await assertLease(request, env)
    // Durable pointer first. A crash at any following await is safe and retryable.
    await bucket.put(archiveKey(key), JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } })
    if (hot) await bucket.delete(key)
    await bucket.delete(pendingKey(key))
    return jsonResponse({ committed: true })
  }
  throw new UploadError('接口不存在', 404, 'NOT_FOUND')
}
