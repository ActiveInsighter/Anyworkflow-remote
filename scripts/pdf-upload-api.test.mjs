import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalXhr = globalThis.XMLHttpRequest
const path = '/api/library/files/uploads/multipart'
const partSize = 32 * 1024 * 1024
const uploads = new Map()
let sequence = 0
let intercept = () => false
class FakeUploadRequest {
  static requests = []
  upload = {}
  headers = {}
  open(method, url) { this.method = method; this.url = url }
  setRequestHeader(key, value) { this.headers[key] = value }
  send(body) {
    this.body = body
    FakeUploadRequest.requests.push(this)
    queueMicrotask(() => { if (!intercept(this)) respond(this) })
  }
  abort() { this.aborted = true; this.onabort?.() }
  fail() { this.onerror?.() }
  respond(payload, status = 200) {
    this.status = status
    this.responseText = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.onload?.()
  }
}
function respond(request) {
  if (request.url === path && request.method === 'POST') {
    const input = JSON.parse(request.body)
    const uploadId = `upload/${++sequence}+opaque`
    const ticket = `ticket-${sequence}`
    uploads.set(uploadId, { ...input, ticket, sequence })
    request.respond({ uploadId, ticket, partSize }, 201)
    return
  }
  const match = request.url.match(/\/multipart\/([^/]+)(?:\/(parts\/\d+|complete))?$/u)
  assert.ok(match, `unexpected upload path ${request.url}`)
  const upload = uploads.get(decodeURIComponent(match[1]))
  assert.equal(request.headers['X-Upload-Ticket'], upload.ticket)
  if (request.method === 'DELETE') { request.respond(undefined, 204); return }
  if (match[2]?.startsWith('parts/')) {
    const partNumber = Number(match[2].slice(6))
    request.respond({ partNumber, etag: `etag-${partNumber}` })
    return
  }
  assert.equal(match[2], 'complete')
  upload.parts = JSON.parse(request.body).parts
  request.respond({ sourceUrl: `https://ocr-files.any1.tech/fixtures/upload-${upload.sequence}.pdf`, fileName: upload.fileName, size: upload.size, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, 201)
}
function pendingUpload(uploadPdf, file, options) {
  const pending = uploadPdf(file, options)
  pending.catch(() => {})
  return pending
}
async function waitFor(predicate) {
  const end = Date.now() + 10_000
  while (!predicate()) {
    assert.ok(Date.now() < end, 'expected upload request did not arrive')
    await new Promise(resolve => setImmediate(resolve))
  }
}
function virtualPdf(size) {
  const slices = []
  return {
    name: 'large.pdf', size, slices,
    arrayBuffer() { throw new Error('a whole PDF must never be read into memory') },
    slice(start, end) {
      slices.push([start, end])
      if (start === 0 && end === 5) return new Blob(['%PDF-'])
      // A size-only Blob stand-in keeps this transport test from allocating GiBs.
      return { size: end - start }
    },
  }
}
globalThis.XMLHttpRequest = FakeUploadRequest
try {
  const { getSession, setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const { uploadPdf, MAX_PDF_UPLOAD_BYTES } = await server.ssrLoadModule('/src/lib/api/file-upload.ts')
  const session = { token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.any1.tech' }
  setSession(session)
  const file = new File(['%PDF-1.7\nfixture'], '讲义.pdf', { type: 'application/pdf' })
  const progress = []
  const success = await uploadPdf(file, { onProgress: value => progress.push(value) })
  assert.equal(success.fileName, file.name)
  assert.equal(success.size, file.size)
  const [start, part, complete] = FakeUploadRequest.requests
  assert.equal(start.method, 'POST')
  assert.deepEqual(JSON.parse(start.body), { fileName: file.name, size: file.size })
  assert.equal(part.method, 'PUT')
  assert.ok(part.url.includes('upload%2F1%2Bopaque/parts/1'), 'opaque upload IDs are URL-encoded')
  assert.equal(part.headers['Content-Type'], 'application/octet-stream')
  assert.equal(part.body.size, file.size)
  assert.deepEqual(JSON.parse(complete.body).parts, [{ partNumber: 1, etag: 'etag-1' }])
  for (const request of [start, part, complete]) {
    assert.equal(request.headers.Authorization, 'Bearer fixture-token')
    assert.equal(request.headers['X-PocketBase-Url'], session.baseUrl)
  }
  assert.equal(progress.at(-1), 100)
  assert.ok(progress.slice(0, -1).every(value => value <= 99))

  const count = FakeUploadRequest.requests.length
  await assert.rejects(() => uploadPdf(new File(['%PDF-'], 'book.txt')), /请选择 PDF/u)
  await assert.rejects(() => uploadPdf(new File([], 'book.pdf')), /文件为空/u)
  await assert.rejects(() => uploadPdf(new File(['not a PDF'], 'book.pdf')), /不是有效的 PDF/u)
  await assert.rejects(() => uploadPdf(virtualPdf(MAX_PDF_UPLOAD_BYTES + 1)), /2 GiB/u)
  const alreadyAborted = new AbortController()
  alreadyAborted.abort()
  await assert.rejects(() => uploadPdf(file, { signal: alreadyAborted.signal }), { name: 'AbortError' })
  assert.equal(FakeUploadRequest.requests.length, count, 'invalid or cancelled files never start a request')

  // Files beyond the old 90 MiB limit use three concurrent bounded slices.
  const large = virtualPdf(partSize * 3 + 17)
  const held = [], largeProgress = []
  intercept = request => {
    if (request.method !== 'PUT') return false
    held.push(request)
    return true
  }
  const largePending = pendingUpload(uploadPdf, large, { onProgress: value => largeProgress.push(value) })
  await waitFor(() => held.length === 3)
  assert.deepEqual(held.map(request => request.body.size), [partSize, partSize, partSize])
  held[0].upload.onprogress({ lengthComputable: true, loaded: partSize / 2 })
  held[1].upload.onprogress({ lengthComputable: true, loaded: partSize / 4 })
  held[2].respond({ partNumber: 3, etag: 'etag-3' })
  await waitFor(() => held.length === 4)
  assert.equal(held[3].body.size, 17)
  held[3].respond({ partNumber: 4, etag: 'etag-4' })
  held[1].respond({ partNumber: 2, etag: 'etag-2' })
  held[0].respond({ partNumber: 1, etag: 'etag-1' })
  assert.equal((await largePending).size, large.size)
  assert.deepEqual(uploads.get('upload/2+opaque').parts.map(value => value.partNumber), [1, 2, 3, 4], 'completion sorts out-of-order parts')
  assert.ok(largeProgress.every((value, index) => !index || value >= largeProgress[index - 1]), 'aggregate progress never goes backwards')
  assert.equal(largeProgress.at(-1), 100)
  assert.ok(large.slices.every(([start, end]) => end - start <= partSize))

  // Exactly 2 GiB is accepted without allocating or reading the entire file.
  intercept = () => false
  assert.equal((await uploadPdf(virtualPdf(MAX_PDF_UPLOAD_BYTES))).size, MAX_PDF_UPLOAD_BYTES)

  let partAttempts = 0, completeAttempts = 0
  const retryProgress = []
  intercept = request => {
    if (request.method === 'PUT') {
      partAttempts++
      if (partAttempts === 1) { request.upload.onprogress({ lengthComputable: true, loaded: file.size - 1 }); request.fail(); return true }
      if (partAttempts === 2) { request.upload.onprogress({ lengthComputable: true, loaded: 1 }); request.respond({ message: 'retry part' }, 503); return true }
    }
    if (request.url.endsWith('/complete')) {
      completeAttempts++
      if (completeAttempts === 1) { request.fail(); return true }
      if (completeAttempts === 2) { request.respond({ message: 'retry complete' }, 503); return true }
    }
    return false
  }
  await uploadPdf(file, { onProgress: value => retryProgress.push(value) })
  assert.equal(partAttempts, 3)
  assert.equal(completeAttempts, 3)
  assert.ok(retryProgress.every((value, index) => !index || value >= retryProgress[index - 1]))

  let exhausted = 0
  const beforeFailure = FakeUploadRequest.requests.length
  intercept = request => {
    if (request.method !== 'PUT') return false
    exhausted++
    request.respond({ message: '存储暂不可用', code: 'STORAGE_UNAVAILABLE' }, 503)
    return true
  }
  await assert.rejects(() => uploadPdf(file), error => error.code === 'STORAGE_UNAVAILABLE' && /存储暂不可用/u.test(error.message))
  assert.equal(exhausted, 4, 'transient part failures have only three retries')
  assert.equal(FakeUploadRequest.requests.at(-1).method, 'DELETE')
  assert.ok(!FakeUploadRequest.requests.slice(beforeFailure).some(request => request.url.endsWith('/complete')))
  assert.ok(getSession(), 'storage errors preserve the session')

  let permanent = 0
  intercept = request => {
    if (request.method !== 'PUT') return false
    permanent++
    request.respond({ message: '票据已过期', code: 'TICKET_EXPIRED' }, 410)
    return true
  }
  await assert.rejects(() => uploadPdf(file), /票据已过期/u)
  assert.equal(permanent, 1, 'permanent failures are never retried')

  const valid = { sourceUrl: 'https://ocr-files.any1.tech/random.pdf', fileName: file.name, size: file.size, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }
  for (const payload of [null, '<html>SPA fallback</html>', { ...valid, size: 1 }, { ...valid, sourceUrl: 'javascript:alert(1)' }, { ...valid, sourceUrl: 'https://example.com/not-pdf' }, { ...valid, expiresAt: '2000-01-01' }]) {
    intercept = request => {
      if (!request.url.endsWith('/complete')) return false
      request.respond(payload)
      return true
    }
    await assert.rejects(() => uploadPdf(file), /上传响应无效/u)
    assert.equal(FakeUploadRequest.requests.at(-1).method, 'DELETE')
  }

  const cancelledParts = []
  intercept = request => {
    if (request.method !== 'PUT') return false
    cancelledParts.push(request)
    return true
  }
  const controller = new AbortController()
  const cancelled = pendingUpload(uploadPdf, large, { signal: controller.signal })
  await waitFor(() => cancelledParts.length === 3)
  controller.abort()
  await assert.rejects(() => cancelled, { name: 'AbortError' })
  assert.ok(cancelledParts.every(request => request.aborted && request.onload === null))
  assert.equal(FakeUploadRequest.requests.at(-1).method, 'DELETE', 'abort cleanup has an independent, live signal')

  const failedParts = []
  intercept = request => {
    if (request.method !== 'PUT') return false
    failedParts.push(request)
    return true
  }
  const failedConcurrent = pendingUpload(uploadPdf, large)
  await waitFor(() => failedParts.length === 3)
  failedParts[0].respond({ message: '分片内容无效', code: 'INVALID_PDF' }, 400)
  await assert.rejects(() => failedConcurrent, /分片内容无效/u)
  assert.ok(failedParts.slice(1).every(request => request.aborted), 'a permanent part failure stops the remaining requests')
  assert.equal(FakeUploadRequest.requests.at(-1).method, 'DELETE')

  let waitingStart
  intercept = request => {
    if (request.url !== path) return false
    waitingStart = request
    return true
  }
  const duringStart = new AbortController()
  const cancelledStart = pendingUpload(uploadPdf, file, { signal: duringStart.signal })
  await waitFor(() => waitingStart)
  duringStart.abort()
  assert.ok(!waitingStart.aborted, 'initialization can return a ticket needed for cleanup')
  respond(waitingStart)
  await assert.rejects(() => cancelledStart, { name: 'AbortError' })
  assert.equal(FakeUploadRequest.requests.at(-1).method, 'DELETE')

  let staleRequest
  intercept = request => { staleRequest = request; return true }
  const stale = pendingUpload(uploadPdf, file)
  await waitFor(() => staleRequest)
  setSession({ ...session, token: 'newly-signed-in-token' })
  staleRequest.respond({ message: '旧会话已过期' }, 401)
  await assert.rejects(() => stale, /旧会话已过期/u)
  assert.equal(getSession().token, 'newly-signed-in-token', 'an old upload cannot sign out a newer session')

  for (const status of [401, 403]) {
    setSession(session)
    intercept = request => { request.respond({ message: '登录已过期，请重新连接' }, status); return true }
    await assert.rejects(() => uploadPdf(file), /登录已过期/u)
    assert.equal(getSession(), null)
  }
  console.log('pdf-upload-api: 2 GiB bounded multipart, concurrency, retries, progress, cancellation and session expiry passed')
} finally {
  globalThis.XMLHttpRequest = originalXhr
  await server.close()
}
