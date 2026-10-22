export class UploadError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function errorResponse(error: UploadError): Response {
  return jsonResponse({ message: error.message, code: error.code }, error.status)
}

export function methodNotAllowed(method: string): Response {
  const response = errorResponse(new UploadError('请求方法不支持', 405, 'METHOD_NOT_ALLOWED'))
  response.headers.set('Allow', method)
  return response
}

/** R2 documents its Workers error code as a numeric suffix in error.message. */
export function r2ErrorCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined
  const match = error.message.match(/\((\d+)\)$/u)
  return match ? Number(match[1]) : undefined
}

export function storageFailure(error?: unknown): UploadError {
  if (error instanceof UploadError) return error
  const code = r2ErrorCode(error)
  if (code === 10024) return new UploadError('上传已取消或失效，请重新选择文件上传', 409, 'UPLOAD_NOT_AVAILABLE')
  if (code === 10025 || code === 10048 || code === 10011) return new UploadError('上传分片不完整或不匹配，请重新上传', 400, 'INVALID_PARTS')
  if (code === 10013 || code === 10054) return new UploadError('文件上传已中断，请重试', 400, 'UPLOAD_INTERRUPTED')
  console.error(JSON.stringify({ event: 'pdf_upload_failed', code: 'STORAGE_UNAVAILABLE' }))
  return new UploadError('文件暂时无法保存，请稍后重试', 502, 'STORAGE_UNAVAILABLE')
}
