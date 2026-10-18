import type { AuthSession } from '../../types'
import { ApiError, request } from './client'
import { AUTH_COLLECTION } from './config'
import { saveBaseUrl, setSession } from './session'

export async function login(identity: string, password: string, baseUrlValue: string): Promise<AuthSession> {
  if (!identity.trim() || !password) throw new ApiError('请输入邮箱和密码', 400, 'AUTH_INPUT_REQUIRED')
  const baseUrl = saveBaseUrl(baseUrlValue)
  const response = await request<{ token: string; record: { id: string; email: string; name?: string } }>(
    `/api/collections/${AUTH_COLLECTION}/auth-with-password`,
    { method: 'POST', baseUrl, data: { identity: identity.trim(), password } },
  )

  if (!response?.token || !response.record?.id || !response.record.email) {
    throw new ApiError('登录响应无效', 502, 'INVALID_AUTH_RESPONSE')
  }

  const session: AuthSession = { token: response.token, record: response.record, baseUrl }
  setSession(session)
  return session
}
