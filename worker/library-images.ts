import { UploadError, jsonResponse, methodNotAllowed } from './errors.js'
import { cleanName } from './library-folders.js'

export const LIBRARY_IMAGES_PATH = '/api/library/images'
export const LIBRARY_IMAGE_SOURCE_PATH = '/api/library/image-sources'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const IMAGE_FILE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(jpg|png|webp|gif)$/u

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

type ImageIndexMeta = {
  id: string
  fileName: string
  mimeType: string
  size: string
  createdAt: string
  indexKey: string
}

function imageObjectKey(id: string): string {
  return `images/${id}`
}

function imageIndexPrefix(owner: string): string {
  return `image-index/${encodeURIComponent(owner)}/`
}

function imageDeletedKey(id: string): string {
  return `deleted/images/${id}`
}

function imageEntry(origin: string, meta: ImageIndexMeta) {
  return {
    id: meta.id,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    size: Number(meta.size),
    createdAt: meta.createdAt,
    sourceUrl: `${origin}${LIBRARY_IMAGE_SOURCE_PATH}/${meta.id}`,
  }
}

function sanitizeImageName(rawHeader: string | null, ext: string): string {
  if (!rawHeader) return `image.${ext}`
  try {
    const decoded = decodeURIComponent(rawHeader).trim()
    if (!decoded) return `image.${ext}`
    return cleanName(decoded, 240, '图片名称')
  } catch {
    return `image.${ext}`
  }
}

export async function uploadLibraryImage(request: Request, env: Env, owner: string): Promise<Response> {
  const rawType = (request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase()
  const ext = MIME_TO_EXT[rawType]
  if (!ext) {
    throw new UploadError('仅支持 JPG、PNG、WebP、GIF 图片格式', 400, 'INVALID_IMAGE_TYPE')
  }
  const canonicalMime = EXT_TO_MIME[ext]
  const contentLength = request.headers.get('Content-Length')
  if (contentLength !== null) {
    const declaredSize = Number(contentLength)
    if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
      throw new UploadError('图片内容为空', 400, 'EMPTY_IMAGE')
    }
    if (declaredSize > MAX_IMAGE_BYTES) {
      throw new UploadError('单张图片最大支持 25 MiB', 413, 'BODY_TOO_LARGE')
    }
  }

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0) {
    throw new UploadError('图片内容为空', 400, 'EMPTY_IMAGE')
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new UploadError('单张图片最大支持 25 MiB', 413, 'BODY_TOO_LARGE')
  }

  const fileName = sanitizeImageName(request.headers.get('X-File-Name'), ext)
  const id = `${crypto.randomUUID()}.${ext}`
  const objectKey = imageObjectKey(id)
  const nowMs = Date.now()
  const createdAt = new Date(nowMs).toISOString()
  const reverseTs = String(Math.max(0, 9999999999999 - nowMs)).padStart(13, '0')
  const indexKey = `${imageIndexPrefix(owner)}${reverseTs}_${id}`
  const meta: ImageIndexMeta = {
    id,
    fileName,
    mimeType: canonicalMime,
    size: String(bytes.byteLength),
    createdAt,
    indexKey,
  }

  try {
    const stored = await env.LIBRARY_FILES.put(objectKey, bytes, {
      httpMetadata: {
        contentType: canonicalMime,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        owner,
        fileName,
        mimeType: canonicalMime,
        size: meta.size,
        createdAt,
        indexKey,
      },
    })
    if (!stored) throw new Error('Missing stored image object')
    await env.LIBRARY_FILES.put(indexKey, '', { customMetadata: { ...meta } })
    const origin = new URL(request.url).origin
    return jsonResponse(imageEntry(origin, meta), 201)
  } catch (error) {
    await env.LIBRARY_FILES.delete([objectKey, indexKey]).catch(() => undefined)
    throw error
  }
}

export async function listLibraryImages(request: Request, env: Env, owner: string): Promise<Response> {
  const url = new URL(request.url)
  const params = url.searchParams
  let cursor = params.get('cursor') || undefined
  const query = (params.get('q') || '').trim().toLocaleLowerCase()
  const sort = params.get('sort') || 'newest'
  if (sort !== 'newest' && sort !== 'oldest') {
    throw new UploadError('排序参数无效', 400, 'INVALID_SORT')
  }
  const limit = params.has('limit') ? Number(params.get('limit')) : 60
  if (cursor && cursor.length > 4096) throw new UploadError('分页信息无效', 400, 'INVALID_CURSOR')
  if (query.length > 255) throw new UploadError('搜索内容过长', 400, 'INVALID_QUERY')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new UploadError('分页大小无效', 400, 'INVALID_LIMIT')
  }

  const origin = url.origin
  const collected: ReturnType<typeof imageEntry>[] = []
  for (let scanned = 0; ; scanned++) {
    const result = await env.LIBRARY_FILES.list({
      prefix: imageIndexPrefix(owner),
      limit,
      cursor,
      include: ['customMetadata'],
    })
    for (const object of result.objects) {
      const meta = object.customMetadata as Partial<ImageIndexMeta> | undefined
      if (!meta?.id) continue
      const fileName = meta.fileName || meta.id
      if (query && !fileName.toLocaleLowerCase().includes(query)) continue
      collected.push(
        imageEntry(origin, {
          id: meta.id,
          fileName,
          mimeType: meta.mimeType || 'image/png',
          size: meta.size || '0',
          createdAt: meta.createdAt || object.uploaded.toISOString(),
          indexKey: meta.indexKey || object.key,
        })
      )
    }
    cursor = result.truncated ? result.cursor : undefined
    if (!query || collected.length > 0 || !cursor || scanned >= 9) {
      break
    }
  }
  if (sort === 'oldest') {
    collected.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return jsonResponse({ items: collected, cursor: cursor || '' })
}

export async function libraryImageItem(
  request: Request,
  env: Env,
  owner: string,
  id: string
): Promise<Response> {
  if (!IMAGE_FILE_ID.test(id)) throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
  const objectKey = imageObjectKey(id)
  const object = await env.LIBRARY_FILES.head(objectKey)
  if (object && object.customMetadata?.owner !== owner) {
    throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
  }
  if (request.method === 'GET') {
    if (!object) throw new UploadError('图片已删除或不存在', 404, 'FILE_NOT_FOUND')
    if (await env.LIBRARY_FILES.head(imageDeletedKey(id))) {
      throw new UploadError('图片已删除', 410, 'FILE_DELETED')
    }
    const origin = new URL(request.url).origin
    return jsonResponse(
      imageEntry(origin, {
        id,
        fileName: object.customMetadata?.fileName || id,
        mimeType: object.customMetadata?.mimeType || object.httpMetadata?.contentType || 'image/png',
        size: String(object.size),
        createdAt: object.customMetadata?.createdAt || object.uploaded.toISOString(),
        indexKey: object.customMetadata?.indexKey || '',
      })
    )
  }
  if (request.method !== 'DELETE') return methodNotAllowed('GET, DELETE')
  if (!object) {
    const tombstone = await env.LIBRARY_FILES.head(imageDeletedKey(id))
    if (tombstone?.customMetadata?.owner !== owner) {
      throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
    }
  }
  const indexKey = object?.customMetadata?.indexKey
  await env.LIBRARY_FILES.put(imageDeletedKey(id), '', { customMetadata: { owner } })
  const toDelete = indexKey ? [objectKey, indexKey] : [objectKey]
  await env.LIBRARY_FILES.delete(toDelete)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

export async function libraryImageSource(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD')
  }
  if (!IMAGE_FILE_ID.test(id)) throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
  if (await env.LIBRARY_FILES.head(imageDeletedKey(id))) {
    throw new UploadError('图片已删除', 410, 'FILE_DELETED')
  }
  const objectKey = imageObjectKey(id)
  const object = request.method === 'HEAD'
    ? await env.LIBRARY_FILES.head(objectKey)
    : await env.LIBRARY_FILES.get(objectKey)
  if (!object) throw new UploadError('图片不存在', 404, 'FILE_NOT_FOUND')
  const ext = id.slice(id.lastIndexOf('.') + 1)
  const contentType = object.httpMetadata?.contentType || EXT_TO_MIME[ext] || 'image/png'
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Length': String(object.size),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  if (object.httpEtag) headers.set('ETag', object.httpEtag)
  return new Response(request.method === 'HEAD' ? null : (object as R2ObjectBody).body, {
    status: 200,
    headers,
  })
}
