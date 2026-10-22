import { UploadError, jsonResponse } from './errors.js'

export const UPLOAD_PATH = '/api/file-conversion/uploads'
export const MULTIPART_PATH = `${UPLOAD_PATH}/multipart`
export const MAX_SINGLE_SIZE = 90 * 1024 * 1024
export const MAX_PDF_SIZE = 2 * 1024 * 1024 * 1024
export const PART_SIZE = 32 * 1024 * 1024
export const FILE_LIFETIME_MS = 24 * 60 * 60 * 1000
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000
export const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]

export function validateFileName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 255 || /[/\\\u0000-\u001f\u007f]/u.test(value) || !/\.pdf$/iu.test(value)) {
    throw new UploadError('请选择 PDF 文件', 400, 'INVALID_FILE_NAME')
  }
  return value
}

export function uploadFileName(request: Request): string {
  let fileName: string
  try {
    fileName = decodeURIComponent(request.headers.get('X-File-Name') || '')
  } catch {
    throw new UploadError('文件名格式无效，请重新选择 PDF', 400, 'INVALID_FILE_NAME')
  }
  return validateFileName(fileName)
}

export function contentLength(request: Request, maxSize: number): number {
  const header = request.headers.get('Content-Length')
  if (!header || !/^\d+$/u.test(header)) {
    throw new UploadError('无法确定文件大小，请重新选择文件上传', 411, 'LENGTH_REQUIRED')
  }
  const size = Number(header)
  if (!Number.isSafeInteger(size) || size > maxSize) {
    throw new UploadError(maxSize === MAX_SINGLE_SIZE ? 'PDF 不能超过 90 MiB' : '上传内容超过大小限制，请重新选择文件', 413, 'FILE_TOO_LARGE')
  }
  if (size < 1 || !request.body) throw new UploadError('文件内容为空', 400, 'INVALID_PDF')
  return size
}

export function uploadedPdf(env: Env, key: string, fileName: string, size: number, expiresAt: string): Response {
  return jsonResponse({ sourceUrl: `${env.PDF_PUBLIC_BASE_URL}/${key}`, fileName, size, expiresAt }, 201)
}

/** Control messages contain at most 64 small part descriptors, never file data. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new UploadError('请求需要 JSON 格式', 415, 'INVALID_CONTENT_TYPE')
  }
  if (!request.body) throw new UploadError('请求内容为空', 400, 'INVALID_JSON')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16 * 1024) {
        await reader.cancel()
        throw new UploadError('请求内容过大', 413, 'REQUEST_TOO_LARGE')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new UploadError('请求内容不是有效 JSON', 400, 'INVALID_JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UploadError('请求内容无效', 400, 'INVALID_JSON')
  return value as Record<string, unknown>
}
