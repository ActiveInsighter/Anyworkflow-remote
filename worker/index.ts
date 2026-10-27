import { authenticate } from './auth.js'
import { UploadError, errorResponse, methodNotAllowed } from './errors.js'
import { abortMultipart, completeMultipart, createMultipart, uploadPart } from './multipart.js'
import { MULTIPART_PATH, UPLOAD_PATH } from './pdf.js'
import { RELAY_PATH, relayUpload } from './relay.js'
import { singleUpload } from './single-upload.js'
import { DOWNLOAD_PATH, downloadArchive } from './download.js'
import { LIBRARY_PATH, LIBRARY_SOURCE_PATH, libraryEnv, libraryFile, librarySource, listLibraryFiles } from './library.js'
import { importLegacyFiles } from './library-import.js'

const MULTIPART_ROUTE = new RegExp(`^${MULTIPART_PATH}/([^/]+)(?:/(parts)/([^/]+)|/(complete))?$`, 'u')
const LIBRARY_MULTIPART = `${LIBRARY_PATH}/uploads/multipart`
const LIBRARY_MULTIPART_ROUTE = new RegExp(`^${LIBRARY_MULTIPART}/([^/]+)(?:/(parts)/([^/]+)|/(complete))?$`, 'u')

async function apiRequest(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === `${LIBRARY_PATH}/import`) {
    if (request.method !== 'POST') return methodNotAllowed('POST')
    return importLegacyFiles(request, env, await authenticate(request, env))
  }
  if (pathname.startsWith(`${LIBRARY_SOURCE_PATH}/`)) return librarySource(request, env, pathname.slice(LIBRARY_SOURCE_PATH.length + 1))
  if (pathname === LIBRARY_PATH) {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    return listLibraryFiles(request, libraryEnv(request, env), await authenticate(request, env))
  }
  if (pathname === LIBRARY_MULTIPART) {
    if (request.method !== 'POST') return methodNotAllowed('POST')
    return createMultipart(request, libraryEnv(request, env), await authenticate(request, env), 2)
  }
  const libraryMatch = LIBRARY_MULTIPART_ROUTE.exec(pathname)
  if (libraryMatch) {
    const method = libraryMatch[2] ? 'PUT' : libraryMatch[4] ? 'POST' : 'DELETE'
    if (request.method !== method) return methodNotAllowed(method)
    let uploadId: string
    try { uploadId = decodeURIComponent(libraryMatch[1]) } catch { throw new UploadError('上传编号格式无效', 400, 'INVALID_UPLOAD_ID') }
    const owner = await authenticate(request, env)
    const storage = libraryEnv(request, env)
    if (libraryMatch[2]) return uploadPart(request, storage, owner, uploadId, libraryMatch[3], 2)
    if (libraryMatch[4]) return completeMultipart(request, storage, owner, uploadId, 2)
    return abortMultipart(request, storage, owner, uploadId, 2)
  }
  if (pathname.startsWith(`${LIBRARY_PATH}/`)) return libraryFile(request, libraryEnv(request, env), await authenticate(request, env), pathname.slice(LIBRARY_PATH.length + 1))
  if (pathname === DOWNLOAD_PATH) return downloadArchive(request, env)
  if (pathname === '/api/file-conversion/dispatcher') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    await authenticate(request, env)
    return env.FILE_CONVERTER.fetch('https://converter.internal/status')
  }
  if (pathname === '/api/file-conversion/wake') {
    if (request.method !== 'POST') return methodNotAllowed('POST')
    await authenticate(request, env)
    // Only a wake signal crosses the private binding. Jobs and parameters come from PocketBase.
    return env.FILE_CONVERTER.fetch('https://converter.internal/wake', { method: 'POST' })
  }
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
