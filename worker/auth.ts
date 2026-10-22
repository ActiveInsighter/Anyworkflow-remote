import { UploadError } from './errors.js'

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

export async function authenticate(request: Request, env: Env): Promise<string> {
  const match = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/iu)
  if (!match) throw new UploadError('请先连接 AnyWorkflow 后再上传', 401, 'AUTH_REQUIRED')
  // The client header selects only a server-allowlisted origin, never a fetch target.
  const trustedOrigin = pocketBaseOrigin(env.POCKETBASE_URL)
  if (!trustedOrigin || pocketBaseOrigin(request.headers.get('X-PocketBase-Url')) !== trustedOrigin) {
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
  return payload.record.id
}
