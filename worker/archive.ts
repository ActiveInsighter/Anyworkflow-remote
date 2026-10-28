import { UploadError } from './errors.js'

export const ARCHIVE_CHUNK_SIZE = 24 * 1024 * 1024
export const PDF_FILE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf$/u
export type ArchiveScope = 'library' | 'relay'
export interface ArchiveRecord {
  v: 1
  scope: ArchiveScope
  key: string
  size: number
  etag: string
  httpEtag: string
  uploaded: string
  customMetadata: Record<string, string>
  chunks: { hash: string; sha256: string; size: number }[]
}
export type ArchiveEnv = Env & { ARCHIVE_ADMIN_SECRET?: string; PDF_ARCHIVE?: Fetcher }
export const archiveKey = (key: string) => `archives/${key}.json`
export const chunkPath = (hash: string) => `/chunks/${hash}.bin`
export const archiveBucket = (env: Env, scope: ArchiveScope) => scope === 'library' ? env.LIBRARY_FILES : env.PDF_UPLOADS

export function validArchive(value: unknown): value is ArchiveRecord {
  if (!value || typeof value !== 'object') return false
  const a = value as Partial<ArchiveRecord>
  return a.v === 1 && (a.scope === 'library' || a.scope === 'relay') && typeof a.key === 'string' && PDF_FILE_ID.test(a.key) &&
    Number.isSafeInteger(a.size) && a.size! >= 5 && a.size! <= 2 * 1024 ** 3 && typeof a.etag === 'string' && !!a.etag &&
    a.httpEtag === `"${a.etag}"` && typeof a.uploaded === 'string' && Number.isFinite(Date.parse(a.uploaded)) &&
    !!a.customMetadata && typeof a.customMetadata === 'object' && !Array.isArray(a.customMetadata) && Object.values(a.customMetadata).every(v => typeof v === 'string') &&
    Array.isArray(a.chunks) && a.chunks.length === Math.ceil(a.size! / ARCHIVE_CHUNK_SIZE) &&
    a.chunks.every((c, i) => c && /^[a-f0-9]{32}$/u.test(c.hash) && /^[a-f0-9]{64}$/u.test(c.sha256) && c.hash === c.sha256.slice(0, 32) && c.size === Math.min(ARCHIVE_CHUNK_SIZE, a.size! - i * ARCHIVE_CHUNK_SIZE))
}

export async function readArchive(bucket: R2Bucket, key: string): Promise<ArchiveRecord | null> {
  const object = await bucket.get(archiveKey(key))
  if (!object) return null
  const record: unknown = await object.json()
  if (!validArchive(record) || record.key !== key) throw new UploadError('文件归档索引损坏', 502, 'ARCHIVE_UNAVAILABLE')
  return record
}

/** Preserve original HTTP identity across tiers, including If-Range and suffix ranges. */
export async function storedPdf(request: Request, env: ArchiveEnv, bucket: R2Bucket, key: string, ctx?: ExecutionContext, archived?: ArchiveRecord): Promise<Response> {
  const hot = archived ? null : await bucket.head(key)
  const cold = archived || (hot ? null : await readArchive(bucket, key))
  const meta = hot || cold
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
  const headers = new Headers({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'ETag': meta.httpEtag, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Length': String(range?.length ?? meta.size) })
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`)
  if (request.method === 'HEAD') return new Response(null, { headers })
  if (hot) {
    const object = await bucket.get(key, { ...(range ? { range } : {}), onlyIf: { etagMatches: hot.etag } })
    // Archival may have finished between head and get. Resolve the committed pointer again.
    if (!object || !('body' in object)) {
      if (await readArchive(bucket, key)) return storedPdf(request, env, bucket, key, ctx)
      throw new UploadError('文件已删除或不存在', 404, 'FILE_NOT_FOUND')
    }
    return new Response(object.body, { status: range ? 206 : 200, headers })
  }
  if (!env.PDF_ARCHIVE || !cold) throw new UploadError('文件归档暂不可用', 503, 'ARCHIVE_UNAVAILABLE')
  const start = range?.offset ?? 0
  const end = start + (range?.length ?? meta.size)
  let position = Math.floor(start / ARCHIVE_CHUNK_SIZE)
  const archive = env.PDF_ARCHIVE
  if (!ctx) throw new UploadError('文件归档读取上下文不可用', 503, 'ARCHIVE_UNAVAILABLE')
  const fetchChunk = async () => {
    const chunkStart = position * ARCHIVE_CHUNK_SIZE
    const chunk = cold.chunks[position++]
    const from = Math.max(0, start - chunkStart)
    const to = Math.min(chunk.size, end - chunkStart) - 1
    const response = await archive.fetch(`https://archive.internal${chunkPath(chunk.hash)}`)
    // Fetch complete immutable assets: Range behavior differs between service bindings and edge caches.
    // RPC responses can omit Content-Length even when HTTP transport later synthesizes it.
    // The outer FixedLengthStream and pre-commit stream hashes enforce actual byte counts.
    // Full chunks pipe natively; only a partial boundary chunk needs a bounded buffer.
    if (response.status === 200 && (!response.headers.has('Content-Length') || Number(response.headers.get('Content-Length')) === chunk.size) && response.body) {
      if (from === 0 && to === chunk.size - 1) return response.body
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength !== chunk.size) throw new UploadError('文件归档分片不完整', 502, 'ARCHIVE_UNAVAILABLE')
      return new Response(bytes.subarray(from, to + 1)).body!
    }
    if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${from}-${to}/${chunk.size}` || Number(response.headers.get('Content-Length')) !== to - from + 1 || !response.body) {
      console.error(JSON.stringify({ event: 'pdf_archive_chunk_unavailable', status: response.status, length: response.headers.get('Content-Length'), range: response.headers.get('Content-Range'), hasBody: !!response.body, expectedSize: chunk.size }))
      await response.body?.cancel()
      throw new UploadError('文件归档分片暂不可用', 502, 'ARCHIVE_UNAVAILABLE')
    }
    return response.body
  }
  // Resolve the first chunk before sending 200/206 so initial failures return an actionable 502.
  let source = await fetchChunk()
  const { readable, writable } = new FixedLengthStream(range?.length ?? meta.size)
  // Native pipeTo avoids a JavaScript callback for every network block of a 2 GiB PDF.
  ctx.waitUntil((async () => {
    try {
      for (;;) {
        await source.pipeTo(writable, { preventClose: true })
        if (position * ARCHIVE_CHUNK_SIZE >= end) break
        source = await fetchChunk()
      }
      await writable.close()
    } catch (error) {
      await source.cancel(error).catch(() => {})
      await writable.abort(error).catch(() => {})
      console.error(JSON.stringify({ event: 'pdf_archive_stream_failed', code: 'ARCHIVE_UNAVAILABLE' }))
    }
  })())
  return new Response(readable, { status: range ? 206 : 200, headers })
}
