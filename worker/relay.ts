import { UploadError } from './errors.js'
import { singleUpload } from './single-upload.js'

export const RELAY_PATH = '/api/file-conversion/relay'

/** Optional secret; without it the relay route does not exist. */
type RelayEnv = Env & { RELAY_UPLOAD_SECRET?: string }

async function sameSecret(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all(
    [given, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))),
  )
  return crypto.subtle.timingSafeEqual(left, right)
}

/**
 * The converter's own segment uploads. AI Studio fetches a linked file far
 * faster than a GitHub runner can upload one, so the runner puts PDF segments
 * here and passes their links on. Authenticated by a shared server secret, not
 * a user session; objects are the same one-day, random-key PDFs as user uploads.
 */
export async function relayUpload(request: Request, env: RelayEnv): Promise<Response> {
  const secret = env.RELAY_UPLOAD_SECRET
  if (!secret || secret.length < 32) throw new UploadError('接口不存在', 404, 'NOT_FOUND')
  const match = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/iu)
  if (!match || !(await sameSecret(match[1], secret))) {
    throw new UploadError('需要转换服务凭据', 401, 'AUTH_REQUIRED')
  }
  return singleUpload(request, env)
}
