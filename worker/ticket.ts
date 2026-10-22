import { UploadError } from './errors.js'
import { FILE_LIFETIME_MS, MAX_PDF_SIZE, PDF_SIGNATURE, SESSION_LIFETIME_MS, validateFileName } from './pdf.js'

export interface UploadTicket {
  v: 1
  owner: string
  key: string
  size: number
  fileName: string
  uploadId: string
  session: string
  createdAt: number
  expiresAt: number
  fileExpiresAt: string
}

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'
const KEY_PATTERN = new RegExp(`^${UUID}\\.pdf$`, 'u')
const SESSION_PATTERN = new RegExp(`^${UUID}$`, 'u')

export function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z\d_-]+$/u.test(value)) throw new Error('Invalid base64url')
  const decoded = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - value.length % 4) % 4))
  const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0))
  if (encodeBase64Url(bytes) !== value) throw new Error('Noncanonical base64url')
  return bytes
}

export async function ticketKey(env: Env): Promise<CryptoKey> {
  if (typeof env.UPLOAD_TICKET_SECRET !== 'string' || env.UPLOAD_TICKET_SECRET.length < 32) {
    throw new UploadError('大文件上传暂未配置，请稍后重试或使用 PDF 链接', 503, 'UPLOAD_NOT_CONFIGURED')
  }
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.UPLOAD_TICKET_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signTicket(ticket: UploadTicket, key: CryptoKey): Promise<string> {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(ticket)))
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function verifyTicket(request: Request, env: Env, owner: string, uploadId: string): Promise<UploadTicket> {
  const key = await ticketKey(env)
  const value = request.headers.get('X-Upload-Ticket') || ''
  let payload: unknown
  try {
    if (value.length > 8192) throw new Error('Ticket too long')
    const segments = value.split('.')
    if (segments.length !== 2) throw new Error('Invalid ticket')
    const signature = decodeBase64Url(segments[1])
    if (signature.byteLength !== 32 || !await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(segments[0]))) {
      throw new Error('Invalid signature')
    }
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(decodeBase64Url(segments[0])))
    if (!isTicket(payload)) throw new Error('Invalid ticket payload')
  } catch {
    // Ticket problems do not invalidate the PocketBase login session.
    throw new UploadError('上传凭据无效，请重新选择文件上传', 400, 'INVALID_UPLOAD_TICKET')
  }
  if (payload.owner !== owner) throw new UploadError('上传不属于当前账号，请重新选择文件上传', 409, 'UPLOAD_OWNER_MISMATCH')
  if (payload.uploadId !== uploadId) throw new UploadError('上传凭据与当前文件不匹配', 400, 'INVALID_UPLOAD_TICKET')
  if (payload.expiresAt <= Date.now()) throw new UploadError('上传已超过十二小时，请重新选择文件上传', 410, 'UPLOAD_EXPIRED')
  return payload
}

function isTicket(value: unknown): value is UploadTicket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const ticket = value as Partial<UploadTicket>
  if (Object.keys(value).length !== 10 || ticket.v !== 1 ||
    typeof ticket.owner !== 'string' || !ticket.owner || ticket.owner.length > 255 ||
    typeof ticket.key !== 'string' || !KEY_PATTERN.test(ticket.key) ||
    typeof ticket.session !== 'string' || !SESSION_PATTERN.test(ticket.session) ||
    typeof ticket.uploadId !== 'string' || !ticket.uploadId || ticket.uploadId.length > 2048 ||
    typeof ticket.size !== 'number' || !Number.isSafeInteger(ticket.size) || ticket.size < PDF_SIGNATURE.length || ticket.size > MAX_PDF_SIZE ||
    typeof ticket.createdAt !== 'number' || !Number.isSafeInteger(ticket.createdAt) || ticket.createdAt > Date.now() + 60_000 ||
    typeof ticket.expiresAt !== 'number' || ticket.expiresAt !== ticket.createdAt + SESSION_LIFETIME_MS ||
    ticket.fileExpiresAt !== new Date(ticket.createdAt + FILE_LIFETIME_MS).toISOString()) return false
  try {
    validateFileName(ticket.fileName)
    return true
  } catch {
    return false
  }
}
