import { UploadError, errorResponse, methodNotAllowed } from './errors.js'

export const DOWNLOAD_PATH = '/api/file-conversion/download'

/** The existing PocketBase file token authorizes this exact protected file at the origin. */
export async function downloadArchive(request: Request, env: Env): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD')
  const params = new URL(request.url).searchParams
  const id = params.get('job') || ''
  const file = params.get('file') || ''
  const token = params.get('token') || ''
  const name = (params.get('name') || 'download.zip').replace(/[\\/\u0000-\u001f\u007f]/gu, '_')
  if (!/^[a-z0-9]{15}$/u.test(id) || !/^[^/\\\u0000-\u001f\u007f]{1,240}\.zip$/u.test(file) || !name.endsWith('.zip') || name.length > 200) {
    throw new UploadError('下载参数无效，请刷新后重试', 400, 'INVALID_DOWNLOAD')
  }
  if (!token || token.length > 4096) throw new UploadError('下载权限已失效，请重新点击下载', 401, 'FILE_TOKEN_REQUIRED')
  const base = new URL(env.POCKETBASE_URL)
  if (base.protocol !== 'https:' || base.username || base.password) throw new UploadError('下载服务暂不可用', 503, 'DOWNLOAD_UNAVAILABLE')
  const url = new URL(`/api/files/aw_pdf_to_md_jobs/${id}/${encodeURIComponent(file)}`, base.origin)
  url.searchParams.set('token', token)
  url.searchParams.set('download', '1')
  const headers = new Headers()
  for (const key of ['Range', 'If-Range']) {
    const value = request.headers.get(key)
    if (value) headers.set(key, value)
  }
  // Bound the wait for headers, not the transfer: a slow mobile download may take minutes.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let upstream: Response
  try {
    upstream = await fetch(url, { method: request.method, headers, redirect: 'manual', signal: controller.signal })
  } catch {
    throw new UploadError('文件暂时无法下载，请稍后重试', 502, 'DOWNLOAD_UNAVAILABLE')
  } finally { clearTimeout(timer) }
  if (upstream.status !== 200 && upstream.status !== 206) {
    await upstream.body?.cancel()
    const status = [401, 403, 404, 416].includes(upstream.status) ? upstream.status : 502
    const response = errorResponse(new UploadError('文件或下载权限已失效，请重新点击下载', status, 'DOWNLOAD_FAILED'))
    if (status === 416 && upstream.headers.has('Content-Range')) response.headers.set('Content-Range', upstream.headers.get('Content-Range')!)
    return response
  }
  const outgoing = new Headers({
    'Content-Type': 'application/zip',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `attachment; filename="download.zip"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/gu, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
  for (const key of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const value = upstream.headers.get(key)
    if (value) outgoing.set(key, value)
  }
  // Pass through the body unchanged: browser download manager owns progress, cancellation and Range.
  return new Response(upstream.body, { status: upstream.status, headers: outgoing })
}
