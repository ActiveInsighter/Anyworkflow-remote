const UPLOAD_PATH = '/api/file-conversion/uploads'
const MAX_PDF_SIZE = 90 * 1024 * 1024
const FILE_LIFETIME_MS = 24 * 60 * 60 * 1000
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]

class UploadError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function errorResponse(error: UploadError): Response {
  return Response.json({ message: error.message, code: error.code }, {
    status: error.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function pocketBaseOrigin(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    return url.origin
  } catch {
    return null
  }
}

async function authenticate(request: Request, env: Env): Promise<void> {
  const authorization = request.headers.get('Authorization')
  const match = authorization?.match(/^Bearer ([^\s]+)$/iu)
  if (!match) throw new UploadError('请先连接 AnyWorkflow 后再上传', 401, 'AUTH_REQUIRED')

  // This is a server-configured allowlist, never a user-selected fetch target.
  const trustedOrigin = pocketBaseOrigin(env.POCKETBASE_URL)
  const requestedOrigin = pocketBaseOrigin(request.headers.get('X-PocketBase-Url'))
  if (!trustedOrigin || requestedOrigin !== trustedOrigin) {
    throw new UploadError('当前 PocketBase 地址不支持上传文件，请使用 PDF 链接', 400, 'UNSUPPORTED_POCKETBASE')
  }

  let response: Response
  try {
    response = await fetch(`${trustedOrigin}/api/collections/aw_clients/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: match[1], Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new UploadError('暂时无法验证登录状态，请稍后重试', 502, 'AUTH_UNAVAILABLE')
  }
  if (response.status === 401 || response.status === 403) {
    throw new UploadError('登录已失效，请重新连接 AnyWorkflow', 401, 'AUTH_EXPIRED')
  }
  if (!response.ok) throw new UploadError('暂时无法验证登录状态，请稍后重试', 502, 'AUTH_UNAVAILABLE')

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new UploadError('登录验证返回无效，请稍后重试', 502, 'INVALID_AUTH_RESPONSE')
  }
  if (!payload || typeof payload !== 'object' || !('record' in payload) ||
    !payload.record || typeof payload.record !== 'object' || !('id' in payload.record) ||
    typeof payload.record.id !== 'string' || !payload.record.id ||
    !('collectionName' in payload.record) || payload.record.collectionName !== 'aw_clients') {
    throw new UploadError('登录验证返回无效，请稍后重试', 502, 'INVALID_AUTH_RESPONSE')
  }
}

function uploadFileName(request: Request): string {
  let fileName: string
  try {
    fileName = decodeURIComponent(request.headers.get('X-File-Name') || '')
  } catch {
    throw new UploadError('文件名格式无效，请重新选择 PDF', 400, 'INVALID_FILE_NAME')
  }
  if (!fileName || fileName.length > 255 || /[/\\\u0000-\u001f\u007f]/u.test(fileName) || !/\.pdf$/iu.test(fileName)) {
    throw new UploadError('请选择 PDF 文件', 400, 'INVALID_FILE_NAME')
  }
  return fileName
}

function uploadLength(request: Request): number {
  const header = request.headers.get('Content-Length')
  if (!header || !/^\d+$/u.test(header)) {
    throw new UploadError('无法确定文件大小，请重新选择文件上传', 411, 'LENGTH_REQUIRED')
  }
  const size = Number(header)
  if (!Number.isSafeInteger(size) || size > MAX_PDF_SIZE) {
    throw new UploadError('PDF 不能超过 90 MiB', 413, 'FILE_TOO_LARGE')
  }
  if (size < PDF_SIGNATURE.length || !request.body) {
    throw new UploadError('文件内容不是有效的 PDF', 400, 'INVALID_PDF')
  }
  return size
}

async function upload(request: Request, env: Env): Promise<Response> {
  await authenticate(request, env)
  const fileName = uploadFileName(request)
  const size = uploadLength(request)
  const body = request.body
  if (!body) throw new UploadError('文件内容为空', 400, 'INVALID_PDF')

  const key = `${crypto.randomUUID()}.pdf`
  const expiresAt = new Date(Date.now() + FILE_LIFETIME_MS).toISOString()
  let received = 0
  let validationError: UploadError | undefined
  function reject(message: string, status: number, code: string): never {
    validationError = new UploadError(message, status, code)
    throw validationError
  }
  const validator = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const offset = received
      received += chunk.byteLength
      if (received > MAX_PDF_SIZE) reject('PDF 不能超过 90 MiB', 413, 'FILE_TOO_LARGE')
      if (received > size) reject('文件大小与上传内容不一致，请重试', 400, 'LENGTH_MISMATCH')
      for (let index = offset; index < Math.min(received, PDF_SIGNATURE.length); index += 1) {
        if (chunk[index - offset] !== PDF_SIGNATURE[index]) reject('文件内容不是有效的 PDF', 400, 'INVALID_PDF')
      }
      controller.enqueue(chunk)
    },
    flush() {
      if (received !== size) reject('文件上传不完整，请重试', 400, 'LENGTH_MISMATCH')
    },
  })
  // R2 requires a stream with a known length. FixedLengthStream preserves that
  // information after validation without buffering a PDF in Worker memory.
  const fixed = new FixedLengthStream(size)
  const transfer = new AbortController()
  // A storage failure may happen before R2 reads the body. Explicitly abort the
  // pump so it cannot remain blocked on the fixed stream's backpressure.
  const storage = Promise.resolve().then(() => env.PDF_UPLOADS.put(key, fixed.readable, {
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-store' },
    customMetadata: { expiresAt },
  })).then(object => {
    if (!object) throw new Error('R2 did not store the upload')
    return object
  }).catch(error => {
    transfer.abort()
    throw error
  })
  const results = await Promise.allSettled([
    body.pipeThrough(validator).pipeTo(fixed.writable, { signal: transfer.signal }),
    storage,
  ])
  const stored = results[1]
  if (results[0].status === 'rejected' || stored.status === 'rejected' || !stored.value || stored.value.size !== size) {
    // R2 commits atomically; also remove a completed object if a stream failure
    // races the commit. Never return a link to an unvalidated upload.
    try {
      await env.PDF_UPLOADS.delete(key)
    } catch {
      console.error(JSON.stringify({ event: 'pdf_upload_failed', code: 'CLEANUP_UNAVAILABLE' }))
    }
    if (validationError) throw validationError
    if (request.signal.aborted) throw new UploadError('文件上传已中断，请重试', 400, 'UPLOAD_INTERRUPTED')
    console.error(JSON.stringify({ event: 'pdf_upload_failed', code: 'STORAGE_UNAVAILABLE' }))
    throw new UploadError('文件暂时无法保存，请稍后重试', 502, 'STORAGE_UNAVAILABLE')
  }
  return Response.json({
    sourceUrl: `${env.PDF_PUBLIC_BASE_URL}/${key}`,
    fileName,
    size,
    expiresAt,
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === UPLOAD_PATH) {
      if (request.method !== 'PUT') {
        const response = errorResponse(new UploadError('请使用 PUT 上传 PDF', 405, 'METHOD_NOT_ALLOWED'))
        response.headers.set('Allow', 'PUT')
        return response
      }
      try {
        return await upload(request, env)
      } catch (error) {
        if (error instanceof UploadError) return errorResponse(error)
        console.error(JSON.stringify({ event: 'pdf_upload_failed', code: 'INTERNAL_ERROR' }))
        return errorResponse(new UploadError('上传失败，请稍后重试', 500, 'INTERNAL_ERROR'))
      }
    }
    if (url.pathname.startsWith('/api/')) return errorResponse(new UploadError('接口不存在', 404, 'NOT_FOUND'))
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
