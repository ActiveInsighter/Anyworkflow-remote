import { UploadError, jsonResponse, methodNotAllowed } from './errors.js'
import { cleanName } from './library-folders.js'

export const LIBRARY_IMAGES_PATH = '/api/library/images'
export const LIBRARY_IMAGE_SOURCE_PATH = '/api/library/images/sources'

const IMAGE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg|jpeg|webp|gif)$/u
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

type ImageIndexMeta = {
  id: string
  fileName: string
  mimeType: string
  size: string
  createdAt: string
  owner: string
  indexKey: string
}

function objectKey(key: string): string {
  return `chat-images/${key}`
}

function imageOwnerPrefix(owner: string): string {
  return `image-owners/${encodeURIComponent(owner)}/`
}

function reverseTimestamp(ms: number): string {
  return String(Math.max(0, 9_999_999_999_999 - ms)).padStart(13, '0')
}

function decodeHeaderFileName(raw: string | null, ext: string): string {
  if (!raw) return `image.${ext}`
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const cleaned = cleanName(decoded, 240, '文件名')
  return cleaned
}

function imageEntry(origin: string, meta: ImageIndexMeta) {
  return {
    id: meta.id,
    sourceUrl: `${origin}${LIBRARY_IMAGE_SOURCE_PATH}/${meta.id}`,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    size: Number(meta.size),
    createdAt: meta.createdAt,
  }
}

async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > maxBytes) {
    throw new UploadError('图片大小不能超过 20 MB', 413, 'IMAGE_TOO_LARGE')
  }
  const body = request.body
  if (!body) {
    throw new UploadError('图片内容不能为空', 400, 'EMPTY_BODY')
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value || value.byteLength === 0) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new UploadError('图片大小不能超过 20 MB', 413, 'IMAGE_TOO_LARGE')
    }
    chunks.push(value)
  }
  if (total === 0) {
    throw new UploadError('图片内容不能为空', 400, 'EMPTY_BODY')
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function uploadLibraryImage(request: Request, env: Env, owner: string): Promise<Response> {
  const rawContentType = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
  const ext = MIME_TO_EXT[rawContentType]
  if (!ext) {
    throw new UploadError('仅支持 PNG、JPEG、WebP 或 GIF 图片', 415, 'UNSUPPORTED_MEDIA_TYPE')
  }
  const mimeType = EXT_TO_MIME[ext]
  const bytes = await readBoundedBytes(request, MAX_IMAGE_BYTES)
  const fileName = decodeHeaderFileName(request.headers.get('X-File-Name'), ext)

  const key = `${crypto.randomUUID()}.${ext}`
  const nowMs = Date.now()
  const createdAt = new Date(nowMs).toISOString()
  const indexKey = `${imageOwnerPrefix(owner)}${reverseTimestamp(nowMs)}_${key}`

  const meta: ImageIndexMeta = {
    id: key,
    fileName,
    mimeType,
    size: String(bytes.byteLength),
    createdAt,
    owner,
    indexKey,
  }

  await env.LIBRARY_FILES.put(objectKey(key), bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { ...meta },
  })
  await env.LIBRARY_FILES.put(indexKey, '', {
    customMetadata: { ...meta },
  })

  const origin = new URL(request.url).origin
  return jsonResponse(imageEntry(origin, meta), 201)
}

export async function listLibraryImages(request: Request, env: Env, owner: string): Promise<Response> {
  const url = new URL(request.url)
  const params = url.searchParams
  let cursor = params.get('cursor') || undefined
  const query = (params.get('q') || '').trim().toLocaleLowerCase()
  const limit = params.has('limit') ? Number(params.get('limit')) : 100
  if (cursor && cursor.length > 4096) throw new UploadError('分页信息无效', 400, 'INVALID_CURSOR')
  if (query.length > 255) throw new UploadError('搜索内容过长', 400, 'INVALID_QUERY')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new UploadError('分页大小无效', 400, 'INVALID_LIMIT')
  }

  const origin = url.origin
  for (let scanned = 0; ; scanned++) {
    const result = await env.LIBRARY_FILES.list({
      prefix: imageOwnerPrefix(owner),
      limit,
      cursor,
      include: ['customMetadata'],
    })
    const items = result.objects
      .map(object => object.customMetadata as ImageIndexMeta | undefined)
      .filter((meta): meta is ImageIndexMeta => Boolean(meta?.id) && (!query || meta!.fileName.toLocaleLowerCase().includes(query)))
      .map(meta => imageEntry(origin, meta))
    cursor = result.truncated ? result.cursor : undefined
    if (!query || items.length || !cursor || scanned >= 9) {
      return jsonResponse({ items, cursor: cursor || '' })
    }
  }
}

export async function libraryImageItem(request: Request, env: Env, owner: string, key: string): Promise<Response> {
  if (!IMAGE_ID.test(key)) throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
  const stored = await env.LIBRARY_FILES.head(objectKey(key))
  if (!stored || stored.customMetadata?.owner !== owner) {
    throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
  }
  const meta = stored.customMetadata as ImageIndexMeta
  if (request.method === 'GET') {
    return jsonResponse(imageEntry(new URL(request.url).origin, meta))
  }
  if (request.method !== 'DELETE') {
    return methodNotAllowed('GET, DELETE')
  }
  const keysToDelete = [objectKey(key)]
  if (meta.indexKey) keysToDelete.push(meta.indexKey)
  await env.LIBRARY_FILES.delete(keysToDelete)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

export async function libraryImageSource(request: Request, env: Env, key: string, _ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  if (!IMAGE_ID.test(key)) {
    throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
  }
  const ext = key.split('.').pop()?.toLowerCase() || 'png'
  const fallbackMime = EXT_TO_MIME[ext] || 'image/png'

  if (request.method === 'HEAD') {
    const head = await env.LIBRARY_FILES.head(objectKey(key))
    if (!head) throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
    const headers = new Headers({
      'Content-Type': head.httpMetadata?.contentType || head.customMetadata?.mimeType || fallbackMime,
      'Content-Length': String(head.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
    if (head.httpEtag) headers.set('ETag', head.httpEtag)
    return new Response(null, { status: 200, headers })
  }

  const object = await env.LIBRARY_FILES.get(objectKey(key))
  if (!object) throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')

  const ifNoneMatch = request.headers.get('If-None-Match')
  if (ifNoneMatch && object.httpEtag && ifNoneMatch === object.httpEtag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: object.httpEtag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType || object.customMetadata?.mimeType || fallbackMime,
    'Content-Length': String(object.size),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  if (object.httpEtag) headers.set('ETag', object.httpEtag)
  return new Response(object.body, { status: 200, headers })
}
