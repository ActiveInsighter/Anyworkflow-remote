import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalXhr = globalThis.XMLHttpRequest
class FakeUploadRequest {
  static requests = []
  upload = {}
  headers = {}
  open(method, url) { this.method = method; this.url = url }
  setRequestHeader(key, value) { this.headers[key] = value }
  send(file) { this.body = file; FakeUploadRequest.requests.push(this) }
  abort() { this.aborted = true; this.onabort?.() }
  respond(payload, status = 201) {
    this.status = status
    this.responseText = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.onload?.()
  }
}
globalThis.XMLHttpRequest = FakeUploadRequest
try {
  const { getSession, setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const { uploadPdf, MAX_PDF_UPLOAD_BYTES } = await server.ssrLoadModule('/src/lib/api/file-upload.ts')
  const session = { token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.any1.tech' }
  setSession(session)
  const file = new File(['%PDF-1.7\nfixture'], '讲义.pdf', { type: 'application/pdf' })
  const uploaded = { sourceUrl: 'https://ocr-files.any1.tech/uploads/random.pdf', fileName: file.name, size: file.size, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }
  async function begin(options) {
    const count = FakeUploadRequest.requests.length
    const pending = uploadPdf(file, options)
    while (FakeUploadRequest.requests.length === count) await new Promise(resolve => setImmediate(resolve))
    return { pending, request: FakeUploadRequest.requests.at(-1) }
  }

  const progress = []
  const success = await begin({ onProgress: value => progress.push(value) })
  assert.equal(success.request.method, 'PUT')
  assert.equal(success.request.url, '/api/file-conversion/uploads')
  assert.equal(success.request.headers.Authorization, 'Bearer fixture-token')
  assert.equal(success.request.headers['X-PocketBase-Url'], session.baseUrl)
  assert.equal(success.request.headers['X-File-Name'], encodeURIComponent(file.name))
  assert.equal(success.request.headers['Content-Type'], 'application/pdf')
  assert.equal(success.request.body, file)
  success.request.upload.onprogress({ lengthComputable: true, loaded: 3, total: 4 })
  success.request.respond(uploaded)
  assert.deepEqual(await success.pending, uploaded)
  assert.deepEqual(progress, [75])

  const count = FakeUploadRequest.requests.length
  await assert.rejects(() => uploadPdf(new File(['%PDF-'], 'book.txt')), /请选择 PDF/u)
  await assert.rejects(() => uploadPdf(new File([], 'book.pdf')), /文件为空/u)
  await assert.rejects(() => uploadPdf(new File(['not a PDF'], 'book.pdf')), /不是有效的 PDF/u)
  await assert.rejects(() => uploadPdf(new File([new Uint8Array(MAX_PDF_UPLOAD_BYTES + 1)], 'large.pdf')), /90 MiB/u)
  const alreadyAborted = new AbortController()
  alreadyAborted.abort()
  await assert.rejects(() => uploadPdf(file, { signal: alreadyAborted.signal }), { name: 'AbortError' })
  assert.equal(FakeUploadRequest.requests.length, count, 'invalid or cancelled files never start a request')

  for (const payload of [null, '<html>SPA fallback</html>', { ...uploaded, size: 1 }, { ...uploaded, sourceUrl: 'javascript:alert(1)' }, { ...uploaded, sourceUrl: 'https://example.com/not-pdf' }, { ...uploaded, expiresAt: '2000-01-01' }]) {
    const bad = await begin()
    bad.request.respond(payload)
    await assert.rejects(() => bad.pending, /上传响应无效/u)
  }
  const failed = await begin()
  failed.request.respond({ message: '临时存储不可用，请稍后重试' }, 503)
  await assert.rejects(() => failed.pending, /临时存储不可用/u)
  assert.ok(getSession(), 'storage errors preserve the session')

  const controller = new AbortController()
  const cancelled = await begin({ signal: controller.signal })
  controller.abort()
  await assert.rejects(() => cancelled.pending, { name: 'AbortError' })
  assert.equal(cancelled.request.aborted, true)
  assert.equal(cancelled.request.onload, null, 'cancelled requests cannot deliver a later result')

  const stale = await begin()
  setSession({ ...session, token: 'newly-signed-in-token' })
  stale.request.respond({ message: '旧会话已过期' }, 401)
  await assert.rejects(() => stale.pending, /旧会话已过期/u)
  assert.equal(getSession().token, 'newly-signed-in-token', 'an old upload cannot sign out a newer session')

  for (const status of [401, 403]) {
    setSession(session)
    const denied = await begin()
    denied.request.respond({ message: '登录已过期，请重新连接' }, status)
    await assert.rejects(() => denied.pending, /登录已过期/u)
    assert.equal(getSession(), null)
  }
  console.log('pdf-upload-api: authenticated raw upload, validation, cancellation and session expiry passed')
} finally {
  globalThis.XMLHttpRequest = originalXhr
  await server.close()
}
