import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { convertV4MiniflareOptions, Miniflare, Response as RuntimeResponse } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
const secret = randomBytes(32).toString('base64url') // Local test secret only.
const assets = await mkdtemp(path.join(tmpdir(), 'anyworkflow-multipart-test-'))
await writeFile(path.join(assets, 'index.html'), '<!doctype html><title>Multipart test</title>')
const authRequests = []
const worker = new Miniflare(convertV4MiniflareOptions({
  name: config.name,
  compatibilityDate: config.compatibility_date,
  modules: [
    {
      type: 'ESModule', path: 'multipart-test-entry.js',
      // Fault injection runs only in this local harness, never deployed code.
      contents: `import app from './worker/index.js';
        export default { async fetch(request, env) {
          request = new Request(request);
          const declared = request.headers.get('X-Test-Declared-Length');
          if (declared === 'missing') request.headers.delete('Content-Length');
          else if (declared !== null) request.headers.set('Content-Length', declared);
          if (request.headers.has('X-Test-Missing-Secret')) env = { ...env, UPLOAD_TICKET_SECRET: '' };
          const fault = request.headers.get('X-Test-Storage-Failure');
          if (fault) {
            const bucket = env.PDF_UPLOADS;
            const fail = () => { throw new Error('Storage unavailable'); };
            env = { ...env, PDF_UPLOADS: {
              createMultipartUpload: (...args) => fault === 'create' ? fail() : bucket.createMultipartUpload(...args),
              resumeMultipartUpload: (key, id) => {
                const upload = bucket.resumeMultipartUpload(key, request.headers.get('X-Test-Real-Upload-Id') || id);
                return {
                  uploadPart: (...args) => fault === 'part' ? fail() : upload.uploadPart(...args),
                  complete: async parts => {
                    if (fault === 'complete') fail();
                    const object = await upload.complete(parts);
                    if (fault === 'complete-after-commit') fail();
                    return object;
                  },
                  abort: () => fault === 'abort' ? fail() : upload.abort(),
                };
              },
              head: key => fault === 'head' ? fail() : bucket.head(key),
              get: (key, options) => {
                if (fault === 'range') fail();
                if (options?.range?.length !== 5) throw new Error('Expected a bounded signature read');
                return bucket.get(key, options);
              },
              delete: key => bucket.delete(key),
            } };
          }
          return app.fetch(request, env);
        } };`,
    },
    ...await workerModules(),
  ],
  bindings: { ...config.vars, UPLOAD_TICKET_SECRET: secret },
  r2Buckets: ['PDF_UPLOADS'],
  assets: {
    directory: assets, binding: config.assets.binding,
    run_worker_first: config.assets.run_worker_first,
    routerConfig: { has_user_worker: true },
    assetConfig: { not_found_handling: config.assets.not_found_handling },
  },
  outboundService: async request => {
    authRequests.push({ url: request.url, authorization: request.headers.get('Authorization') })
    if (request.headers.get('Authorization') === 'expired') return RuntimeResponse.json({}, { status: 401 })
    return RuntimeResponse.json({ record: {
      id: request.headers.get('Authorization') === 'other-session' ? 'client-2' : 'client-1',
      collectionName: 'aw_clients',
    } })
  },
}))

const base = 'https://awremote.example.invalid/api/file-conversion/uploads/multipart'
const partSize = 32 * 1024 * 1024
const pdf = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
function headers(extra = {}) {
  return { Authorization: 'Bearer valid-session', 'X-PocketBase-Url': config.vars.POCKETBASE_URL, ...extra }
}
function sessionUrl(session) { return `${base}/${encodeURIComponent(session.uploadId)}` }
function initiate(payload = { fileName: '扫描讲义.pdf', size: pdf.length }, extra = {}) {
  return worker.dispatchFetch(base, { method: 'POST', headers: headers({ 'Content-Type': 'application/json', ...extra }), body: JSON.stringify(payload) })
}
async function newSession(size = pdf.length) {
  const response = await initiate({ fileName: '扫描讲义.pdf', size })
  assert.equal(response.status, 201, await response.clone().text())
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const session = await response.json()
  assert.equal(session.partSize, partSize)
  return session
}
function putPart(session, number, body = pdf, extra = {}) {
  return worker.dispatchFetch(`${sessionUrl(session)}/parts/${number}`, {
    method: 'PUT', headers: headers({ 'Content-Type': 'application/octet-stream', 'X-Upload-Ticket': session.ticket, ...extra }), body, duplex: 'half',
  })
}
function complete(session, parts, extra = {}) {
  return worker.dispatchFetch(`${sessionUrl(session)}/complete`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json', 'X-Upload-Ticket': session.ticket, ...extra }), body: JSON.stringify({ parts }),
  })
}
function abort(session, extra = {}) {
  return worker.dispatchFetch(sessionUrl(session), { method: 'DELETE', headers: headers({ 'X-Upload-Ticket': session.ticket, ...extra }) })
}
async function expectError(response, status, code) {
  assert.equal(response.status, status, await response.clone().text())
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal((await response.json()).code, code)
}
function payloadOf(session) { return JSON.parse(Buffer.from(session.ticket.split('.')[0], 'base64url').toString()) }
function signedSession(session, changes) {
  const payload = Buffer.from(JSON.stringify({ ...payloadOf(session), ...changes })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return { ...session, ticket: `${payload}.${signature}` }
}
function fileStream(length, prefix = '%PDF-1.7\n') {
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset === length) return controller.close()
      const chunk = new Uint8Array(Math.min(64 * 1024, length - offset))
      if (offset === 0) chunk.set(new TextEncoder().encode(prefix).slice(0, chunk.length))
      offset += chunk.length
      controller.enqueue(chunk)
    },
  })
}
async function successfulPart(session, number, body = pdf, extra = {}) {
  const response = await putPart(session, number, body, extra)
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  return response.json()
}

try {
  const bucket = await worker.getR2Bucket('PDF_UPLOADS')
  await expectError(await initiate(undefined, { Authorization: '' }), 401, 'AUTH_REQUIRED')
  await expectError(await initiate(undefined, { 'X-PocketBase-Url': 'https://attacker.example' }), 400, 'UNSUPPORTED_POCKETBASE')
  assert.equal(authRequests.length, 0)
  await expectError(await initiate(undefined, { Authorization: 'Bearer expired' }), 401, 'AUTH_EXPIRED')
  await expectError(await initiate({ fileName: 'notes.pdf', size: 2 * 1024 ** 3 + 1 }), 413, 'FILE_TOO_LARGE')
  for (const size of [0, -1, 4, 5.5, '5', null]) await expectError(await initiate({ fileName: 'notes.pdf', size }), 400, 'INVALID_FILE_SIZE')
  await expectError(await initiate({ fileName: '../notes.pdf', size: 5 }), 400, 'INVALID_FILE_NAME')
  await expectError(await initiate({ fileName: 'notes.pdf', size: 5, key: 'chosen.pdf' }), 400, 'INVALID_UPLOAD_REQUEST')
  await expectError(await initiate(undefined, { 'X-Test-Missing-Secret': '1' }), 503, 'UPLOAD_NOT_CONFIGURED')
  await expectError(await initiate(undefined, { 'X-Test-Storage-Failure': 'create' }), 502, 'STORAGE_UNAVAILABLE')
  await expectError(await initiate(undefined, { 'Content-Type': 'text/plain' }), 415, 'INVALID_CONTENT_TYPE')
  await expectError(await worker.dispatchFetch(base, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: '{' }), 400, 'INVALID_JSON')
  await expectError(await initiate({ fileName: 'notes.pdf', size: 5, junk: 'x'.repeat(20 * 1024) }), 413, 'REQUEST_TOO_LARGE')

  const session = await newSession()
  const ticket = payloadOf(session)
  assert.equal(ticket.owner, 'client-1')
  assert.equal(ticket.expiresAt - ticket.createdAt, 12 * 60 * 60 * 1000)
  assert.equal(Date.parse(ticket.fileExpiresAt) - ticket.createdAt, 24 * 60 * 60 * 1000)
  await expectError(await putPart(session, 1, pdf, { Authorization: '' }), 401, 'AUTH_REQUIRED')
  await expectError(await complete(session, [], { Authorization: '' }), 401, 'AUTH_REQUIRED')
  await expectError(await abort(session, { Authorization: '' }), 401, 'AUTH_REQUIRED')
  await expectError(await complete(session, [], { 'X-PocketBase-Url': 'https://attacker.example' }), 400, 'UNSUPPORTED_POCKETBASE')
  await expectError(await abort(session, { 'X-PocketBase-Url': 'https://attacker.example' }), 400, 'UNSUPPORTED_POCKETBASE')
  for (const invalid of ['', 'abc.def', `${session.ticket}extra`, `${session.ticket.split('.')[0]}.AA`]) {
    await expectError(await putPart({ ...session, ticket: invalid }, 1), 400, 'INVALID_UPLOAD_TICKET')
  }
  const modified = Buffer.from(JSON.stringify({ ...ticket, size: ticket.size + 1 })).toString('base64url')
  await expectError(await putPart({ ...session, ticket: `${modified}.${session.ticket.split('.')[1]}` }, 1), 400, 'INVALID_UPLOAD_TICKET')
  await expectError(await putPart(session, 1, pdf, { Authorization: 'Bearer other-session' }), 409, 'UPLOAD_OWNER_MISMATCH')
  await expectError(await putPart({ ...session, uploadId: 'different-id' }, 1), 400, 'INVALID_UPLOAD_TICKET')
  const past = Date.now() - 13 * 60 * 60 * 1000
  await expectError(await putPart(signedSession(session, {
    createdAt: past, expiresAt: past + 12 * 60 * 60 * 1000, fileExpiresAt: new Date(past + 24 * 60 * 60 * 1000).toISOString(),
  }), 1), 410, 'UPLOAD_EXPIRED')
  for (const changes of [{ size: 2 * 1024 ** 3 + 1 }, { size: -1 }, { key: '../other.pdf' }, { fileName: 'other.exe' }, { v: 2 }]) {
    await expectError(await putPart(signedSession(session, changes), 1), 400, 'INVALID_UPLOAD_TICKET')
  }
  for (const number of ['0', '-1', '01', '1.5', 'Infinity', '2']) await expectError(await putPart(session, number), 400, 'INVALID_PART_NUMBER')
  await expectError(await putPart(session, 1, pdf, { 'X-Test-Declared-Length': 'missing' }), 411, 'LENGTH_REQUIRED')
  await expectError(await putPart(session, 1, pdf, { 'X-Test-Declared-Length': String(partSize + 1) }), 413, 'FILE_TOO_LARGE')
  await expectError(await putPart(session, 1, pdf, { 'X-Test-Declared-Length': '5' }), 400, 'LENGTH_MISMATCH')
  await expectError(await putPart(session, 1, 'x'.repeat(pdf.length)), 400, 'INVALID_PDF')
  await expectError(await putPart(session, 1, pdf.slice(0, -1), { 'X-Test-Declared-Length': String(pdf.length) }), 400, 'LENGTH_MISMATCH')
  await expectError(await putPart(session, 1, pdf + 'x', { 'X-Test-Declared-Length': String(pdf.length) }), 400, 'LENGTH_MISMATCH')
  let timer
  try {
    const failure = await Promise.race([
      putPart(session, 1, pdf, { 'X-Test-Storage-Failure': 'part' }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Multipart storage failure blocked the upload pump')), 3000) }),
    ])
    await expectError(failure, 502, 'STORAGE_UNAVAILABLE')
  } finally { clearTimeout(timer) }
  await expectError(await complete(session, []), 400, 'INVALID_PARTS')
  await expectError(await complete(session, [{ partNumber: 1, etag: '0'.repeat(32) }]), 400, 'INVALID_PARTS')
  assert.equal((await bucket.list()).objects.length, 0)

  const part = await successfulPart(session, 1)
  await expectError(await complete(session, [{ ...part, key: 'other.pdf' }]), 400, 'INVALID_PARTS')
  await expectError(await complete(session, [part], { 'X-Test-Storage-Failure': 'head' }), 502, 'STORAGE_UNAVAILABLE')
  await expectError(await complete(session, [part], { 'X-Test-Storage-Failure': 'complete' }), 502, 'STORAGE_UNAVAILABLE')
  const committed = await complete(session, [part], { 'X-Test-Storage-Failure': 'complete-after-commit' })
  assert.equal(committed.status, 201, await committed.clone().text())
  const uploaded = await committed.json()
  assert.equal(uploaded.fileName, '扫描讲义.pdf')
  assert.equal(uploaded.size, pdf.length)
  assert.match(uploaded.sourceUrl, /^https:\/\/ocr-files\.any1\.tech\/[a-f\d-]{36}\.pdf$/u)
  assert.deepEqual(await (await complete(session, [part])).json(), uploaded)
  const stored = await bucket.get(ticket.key)
  assert.equal(await stored.text(), pdf)
  assert.deepEqual(stored.customMetadata, { uploadSession: ticket.session, expiresAt: ticket.fileExpiresAt })
  assert.equal(stored.httpMetadata.contentType, 'application/pdf')
  assert.equal(stored.httpMetadata.cacheControl, 'no-store')
  assert.equal((await abort(session)).status, 204)
  assert.ok(await bucket.head(ticket.key), 'Cancellation after complete must preserve the public PDF')
  await expectError(await putPart(session, 1), 409, 'UPLOAD_NOT_AVAILABLE')

  const max = await newSession(2 * 1024 ** 3)
  await expectError(await putPart(max, 65), 400, 'INVALID_PART_NUMBER')
  assert.equal((await abort(max)).status, 204)
  assert.equal((await abort(max)).status, 204)
  const cancelled = await newSession()
  await successfulPart(cancelled, 1)
  await expectError(await abort(cancelled, { 'X-Test-Storage-Failure': 'abort' }), 502, 'STORAGE_UNAVAILABLE')
  assert.equal((await abort(cancelled)).status, 204)
  await expectError(await complete(cancelled, [part]), 409, 'UPLOAD_NOT_AVAILABLE')

  // R2 upload IDs are opaque strings and may need URL escaping, unlike keys.
  const opaque = await newSession()
  const opaqueId = 'opaque/id+with?reserved=%characters'
  const alias = { ...signedSession(opaque, { uploadId: opaqueId }), uploadId: opaqueId }
  const aliasHeaders = { 'X-Test-Storage-Failure': 'alias', 'X-Test-Real-Upload-Id': opaque.uploadId }
  const aliasPart = await successfulPart(alias, 1, pdf, aliasHeaders)
  assert.equal((await complete(alias, [aliasPart], aliasHeaders)).status, 201)
  assert.equal((await abort(alias, aliasHeaders)).status, 204)

  // Real 32 MiB parts are streamed concurrently and out of order into local R2.
  const large = await newSession(2 * partSize + 17)
  const [second, last, first] = await Promise.all([
    successfulPart(large, 2, fileStream(partSize, 'part two'), { 'X-Test-Declared-Length': String(partSize) }),
    successfulPart(large, 3, fileStream(17, 'last part'), { 'X-Test-Declared-Length': '17' }),
    successfulPart(large, 1, fileStream(partSize), { 'X-Test-Declared-Length': String(partSize) }),
  ])
  await expectError(await complete(large, [second, first, last]), 400, 'INVALID_PARTS')
  await expectError(await complete(large, [first, first, last]), 400, 'INVALID_PARTS')
  const concurrent = await Promise.all([complete(large, [first, second, last]), complete(large, [first, second, last])])
  assert.ok(concurrent.every(response => response.status === 201))
  const links = await Promise.all(concurrent.map(response => response.json()))
  assert.deepEqual(links[0], links[1])
  const largeObject = await bucket.head(payloadOf(large).key)
  assert.equal(largeObject.size, 2 * partSize + 17)
  assert.equal((await abort(large)).status, 204)
  assert.ok(await bucket.head(payloadOf(large).key))

  // Even a forged completion/stale receipt cannot turn a corrupt object into a
  // successful response; only the matching session's bad object may be removed.
  for (const kind of ['size', 'signature', 'session']) {
    const corrupted = await newSession()
    const info = payloadOf(corrupted)
    const body = kind === 'size' ? '%PDF-bad' : kind === 'signature' ? 'x'.repeat(pdf.length) : pdf
    await bucket.put(info.key, body, {
      httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-store' },
      customMetadata: { uploadSession: kind === 'session' ? 'another-session' : info.session, expiresAt: info.fileExpiresAt },
    })
    await expectError(await complete(corrupted, [part]), kind === 'session' ? 409 : 400, kind === 'session' ? 'UPLOAD_SESSION_MISMATCH' : 'INVALID_COMPLETED_FILE')
    assert.equal(Boolean(await bucket.head(info.key)), kind === 'session')
    await bucket.delete(info.key)
    await abort(corrupted)
  }
  const rangeFailure = await newSession()
  const rangePart = await successfulPart(rangeFailure, 1)
  await expectError(await complete(rangeFailure, [rangePart], { 'X-Test-Storage-Failure': 'range' }), 502, 'STORAGE_UNAVAILABLE')
  assert.equal((await complete(rangeFailure, [rangePart], { 'X-Test-Storage-Failure': 'bounded-read-check' })).status, 201)
  assert.ok(authRequests.every(request => request.url === `${config.vars.POCKETBASE_URL}/api/collections/aw_clients/auth-refresh`))
  console.log('upload-worker-multipart: streamed concurrent 32 MiB parts, HMAC/owner/size checks, corruption rejection, retries and cancellation passed')
} finally {
  await worker.dispose()
  await rm(assets, { recursive: true, force: true })
}
