import { authenticate } from './auth.js'
import { UploadError, errorResponse, methodNotAllowed } from './errors.js'
import { abortMultipart, completeMultipart, createMultipart, uploadPart } from './multipart.js'
import { MULTIPART_PATH, UPLOAD_PATH } from './pdf.js'
import { RELAY_PATH, relayUpload } from './relay.js'
import { singleUpload } from './single-upload.js'

const MULTIPART_ROUTE = new RegExp(`^${MULTIPART_PATH}/([^/]+)(?:/(parts)/([^/]+)|/(complete))?$`, 'u')

async function apiRequest(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === UPLOAD_PATH) {
    if (request.method !== 'PUT') return methodNotAllowed('PUT')
    await authenticate(request, env)
    return singleUpload(request, env)
  }
  if (pathname === RELAY_PATH) {
    if (request.method !== 'PUT') return methodNotAllowed('PUT')
    return relayUpload(request, env)
  }
  if (pathname === MULTIPART_PATH) {
    if (request.method !== 'POST') return methodNotAllowed('POST')
    return createMultipart(request, env, await authenticate(request, env))
  }
  const match = MULTIPART_ROUTE.exec(pathname)
  if (match) {
    const method = match[2] ? 'PUT' : match[4] ? 'POST' : 'DELETE'
    if (request.method !== method) return methodNotAllowed(method)
    let uploadId: string
    try {
      uploadId = decodeURIComponent(match[1])
    } catch {
      throw new UploadError('上传编号格式无效', 400, 'INVALID_UPLOAD_ID')
    }
    const owner = await authenticate(request, env)
    if (match[2]) return uploadPart(request, env, owner, uploadId, match[3])
    if (match[4]) return completeMultipart(request, env, owner, uploadId)
    return abortMultipart(request, env, owner, uploadId)
  }
  return errorResponse(new UploadError('接口不存在', 404, 'NOT_FOUND'))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return await apiRequest(request, env, url.pathname)
    } catch (error) {
      if (error instanceof UploadError) return errorResponse(error)
      console.error(JSON.stringify({ event: 'pdf_upload_failed', code: 'INTERNAL_ERROR' }))
      return errorResponse(new UploadError('上传失败，请稍后重试', 500, 'INTERNAL_ERROR'))
    }
  },
} satisfies ExportedHandler<Env>
