import { ApiError } from './client'
import { clearSession, getSession, requireSession } from './session'

export const MAX_PDF_UPLOAD_BYTES = 90 * 1024 * 1024

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

/** Uploads only to our authenticated same-origin relay. R2 credentials never reach the browser. */
export async function uploadPdf(file: File, { signal, onProgress }: UploadOptions = {}): Promise<UploadedPdf> {
  if (!/\.pdf$/iu.test(file.name)) throw new ApiError('请选择 PDF 文件', 400, 'INVALID_FILE_TYPE')
  if (!file.size) throw new ApiError('文件为空，请重新选择', 400, 'EMPTY_FILE')
  if (file.size > MAX_PDF_UPLOAD_BYTES) throw new ApiError('PDF 不能超过 90 MiB', 400, 'FILE_TOO_LARGE')
  const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (String.fromCharCode(...signature) !== '%PDF-') throw new ApiError('文件内容不是有效的 PDF', 400, 'INVALID_FILE_TYPE')
  signal?.throwIfAborted()
  const session = requireSession()

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const finish = (error?: unknown, value?: UploadedPdf) => {
      signal?.removeEventListener('abort', abort)
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null
      xhr.upload.onprogress = null
      if (error) reject(error)
      else if (value) resolve(value)
    }
    xhr.open('PUT', '/api/file-conversion/uploads')
    xhr.timeout = 10 * 60 * 1000
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('Content-Type', 'application/pdf')
    xhr.setRequestHeader('Authorization', `Bearer ${session.token}`)
    xhr.setRequestHeader('X-PocketBase-Url', session.baseUrl)
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)))
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
        finish(new ApiError(message, xhr.status, 'UPLOAD_FAILED'))
        return
      }
      try { finish(undefined, normalizeUpload(payload, file.size)) } catch (error) { finish(error) }
    }
    xhr.onerror = () => finish(new ApiError('上传连接中断，请检查网络后重试', 0, 'NETWORK_ERROR'))
    xhr.ontimeout = () => finish(new ApiError('上传超时，请检查网络后重试', 0, 'UPLOAD_TIMEOUT'))
    xhr.onabort = () => finish(new DOMException('上传已取消', 'AbortError'))
    signal?.addEventListener('abort', abort, { once: true })
    try { xhr.send(file) } catch { finish(new ApiError('无法上传文件，请检查网络后重试', 0, 'NETWORK_ERROR')) }
  })
}
