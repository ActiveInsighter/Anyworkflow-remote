import { ApiError } from './client'
import { clearSession, getSession, requireSession } from './session'
import type { AuthSession } from '../../types'

export const MAX_PDF_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
const PART_SIZE = 32 * 1024 * 1024
const PART_CONCURRENCY = 3
const PART_RETRIES = 3
const UPLOAD_PATH = '/api/file-conversion/uploads/multipart'

export interface UploadedPdf {
  sourceUrl: string
  fileName: string
  size: number
  expiresAt: string
}

interface UploadOptions {
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

interface MultipartUpload {
  uploadId: string
  ticket: string
  partSize: number
}

interface UploadedPart {
  partNumber: number
  etag: string
}

interface UploadRequest {
  method: 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: string | Blob
  ticket?: string
  signal?: AbortSignal
  onProgress?: (loaded: number) => void
}

function normalizeMultipart(payload: unknown): MultipartUpload {
  if (payload && typeof payload === 'object' && 'uploadId' in payload && 'ticket' in payload && 'partSize' in payload &&
    typeof payload.uploadId === 'string' && payload.uploadId && typeof payload.ticket === 'string' && payload.ticket && payload.partSize === PART_SIZE) {
    return { uploadId: payload.uploadId, ticket: payload.ticket, partSize: payload.partSize }
  }
  throw new ApiError('上传初始化响应无效，请重新上传', 502, 'INVALID_UPLOAD_RESPONSE')
}

function normalizePart(payload: unknown, partNumber: number): UploadedPart {
  if (payload && typeof payload === 'object' && 'partNumber' in payload && payload.partNumber === partNumber &&
    'etag' in payload && typeof payload.etag === 'string' && payload.etag) {
    return { partNumber, etag: payload.etag }
  }
  throw new ApiError('分片上传响应无效，请重新上传', 502, 'INVALID_UPLOAD_RESPONSE')
}

function normalizeUpload(payload: unknown, size: number): UploadedPdf {
  if (payload && typeof payload === 'object' && 'sourceUrl' in payload && 'fileName' in payload && 'size' in payload && 'expiresAt' in payload) {
    const { sourceUrl, fileName, size: uploadedSize, expiresAt } = payload
    if (typeof sourceUrl === 'string' && typeof fileName === 'string' && fileName && uploadedSize === size && typeof expiresAt === 'string' && Date.parse(expiresAt) > Date.now()) {
      try {
        const url = new URL(sourceUrl)
        if (url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith('.pdf')) {
          return { sourceUrl, fileName, size, expiresAt }
        }
      } catch { /* Report an invalid upload response below. */ }
    }
  }
  throw new ApiError('上传响应无效，请重新上传', 502, 'INVALID_UPLOAD_RESPONSE')
}

function uploadRequest(session: AuthSession, { method, path, body, ticket, signal, onProgress }: UploadRequest): Promise<unknown> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const finish = (error?: unknown, value?: unknown) => {
      signal?.removeEventListener('abort', abort)
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null
      xhr.upload.onprogress = null
      if (error) reject(error)
      else resolve(value)
    }
    xhr.open(method, path)
    xhr.timeout = method === 'PUT' ? 10 * 60 * 1000 : 30_000
    xhr.setRequestHeader('Accept', 'application/json')
    if (body !== undefined) xhr.setRequestHeader('Content-Type', typeof body === 'string' ? 'application/json' : 'application/octet-stream')
    xhr.setRequestHeader('Authorization', `Bearer ${session.token}`)
    xhr.setRequestHeader('X-PocketBase-Url', session.baseUrl)
    if (ticket) xhr.setRequestHeader('X-Upload-Ticket', ticket)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded)
    }
    xhr.onload = () => {
      let payload: unknown
      try { payload = JSON.parse(xhr.responseText) } catch { payload = null }
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401 || xhr.status === 403) {
          const current = getSession()
          if (current?.token === session.token && current.baseUrl === session.baseUrl && current.record.id === session.record.id) clearSession()
        }
        const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
          ? payload.message : `上传失败（${xhr.status}），请重试`
        const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string'
          ? payload.code : 'UPLOAD_FAILED'
        finish(new ApiError(message, xhr.status, code))
        return
      }
      finish(undefined, payload)
    }
    xhr.onerror = () => finish(new ApiError('上传连接中断，请检查网络后重试', 0, 'NETWORK_ERROR'))
    xhr.ontimeout = () => finish(new ApiError('上传超时，请检查网络后重试', 0, 'UPLOAD_TIMEOUT'))
    xhr.onabort = () => finish(new DOMException('上传已取消', 'AbortError'))
    signal?.addEventListener('abort', abort, { once: true })
    try { xhr.send(body) } catch { finish(new ApiError('无法上传文件，请检查网络后重试', 0, 'NETWORK_ERROR')) }
  })
}

function retryable(error: unknown): boolean {
  return error instanceof ApiError && error.code !== 'INVALID_UPLOAD_RESPONSE' &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)
}

function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('上传已取消', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
  })
}

async function withUploadRetries<T>(load: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await load() } catch (error) {
      if (signal.aborted || attempt >= PART_RETRIES || !retryable(error)) throw error
      await retryDelay(500 * 2 ** attempt, signal)
    }
  }
}

/** Uploads bounded Blob slices through our authenticated relay; R2 credentials stay on the server. */
export async function uploadPdf(file: File, { signal, onProgress }: UploadOptions = {}): Promise<UploadedPdf> {
  if (!/\.pdf$/iu.test(file.name)) throw new ApiError('请选择 PDF 文件', 400, 'INVALID_FILE_TYPE')
  if (!file.size) throw new ApiError('文件为空，请重新选择', 400, 'EMPTY_FILE')
  if (file.size > MAX_PDF_UPLOAD_BYTES) throw new ApiError('PDF 不能超过 2 GiB', 400, 'FILE_TOO_LARGE')
  const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (String.fromCharCode(...signature) !== '%PDF-') throw new ApiError('文件内容不是有效的 PDF', 400, 'INVALID_FILE_TYPE')
  signal?.throwIfAborted()
  const session = requireSession()
  const transfer = new AbortController()
  const cancel = () => transfer.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  let multipart: MultipartUpload | undefined
  let path = ''

  try {
    // Let initialization return its ticket even if the caller cancels, so the
    // newly created multipart upload can still be explicitly cleaned up.
    multipart = normalizeMultipart(await uploadRequest(session, {
      method: 'POST', path: UPLOAD_PATH, body: JSON.stringify({ fileName: file.name, size: file.size }),
    }))
    path = `${UPLOAD_PATH}/${encodeURIComponent(multipart.uploadId)}`
    transfer.signal.throwIfAborted()
    const { ticket, partSize } = multipart
    const partCount = Math.ceil(file.size / partSize)
    const parts = new Array<UploadedPart>(partCount)
    const loaded = new Array<number>(partCount).fill(0)
    let nextPart = 0
    let failure: unknown
    function progress(index: number, bytes: number) {
      if (transfer.signal.aborted) return
      loaded[index] = Math.max(loaded[index], Math.min(bytes, Math.min(partSize, file.size - index * partSize)))
      onProgress?.(Math.min(99, Math.floor(loaded.reduce((sum, value) => sum + value, 0) / file.size * 100)))
    }
    async function worker() {
      while (nextPart < partCount) {
        transfer.signal.throwIfAborted()
        const index = nextPart++
        const partNumber = index + 1
        const blob = file.slice(index * partSize, Math.min(file.size, (index + 1) * partSize))
        parts[index] = await withUploadRetries(async () => normalizePart(await uploadRequest(session, {
          method: 'PUT', path: `${path}/parts/${partNumber}`, body: blob, ticket,
          signal: transfer.signal, onProgress: (bytes) => progress(index, bytes),
        }), partNumber), transfer.signal)
        progress(index, blob.size)
      }
    }
    const workers = Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, () => worker().catch((error: unknown) => {
      if (failure === undefined) failure = error
      transfer.abort()
      throw error
    }))
    await Promise.allSettled(workers)
    if (failure !== undefined) throw failure
    transfer.signal.throwIfAborted()
    const result = await withUploadRetries(async () => normalizeUpload(await uploadRequest(session, {
      method: 'POST', path: `${path}/complete`, body: JSON.stringify({ parts }), ticket, signal: transfer.signal,
    }), file.size), transfer.signal)
    onProgress?.(100)
    return result
  } catch (error) {
    transfer.abort()
    if (multipart) {
      // Cleanup gets its own timeout and must work after the upload signal was aborted.
      try { await uploadRequest(session, { method: 'DELETE', path, ticket: multipart.ticket }) } catch { /* R2 lifecycle also cleans abandoned parts. */ }
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}
