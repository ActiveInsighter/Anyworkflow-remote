import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { convertV4MiniflareOptions, Miniflare, Response as RuntimeResponse } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
const assetDirectory = await mkdtemp(path.join(tmpdir(), 'anyworkflow-upload-assets-'))
await writeFile(path.join(assetDirectory, 'index.html'), '<!doctype html><title>AnyWorkflow upload test</title>')
const authRequests = []
let authResponse = () => RuntimeResponse.json({ record: { id: 'client-1', collectionName: 'aw_clients' } })
const worker = new Miniflare(convertV4MiniflareOptions({
  name: config.name,
  compatibilityDate: config.compatibility_date,
  modules: [
    {
      type: 'ESModule',
      path: 'upload-test-entry.js',
      // HTTP clients enforce their own Content-Length. Change only the local
      // request headers inside workerd to exercise dishonest/truncated inputs.
      contents: `import app from './worker/index.js';
        export default { async fetch(request, env) {
          request = new Request(request);
          const declared = request.headers.get('X-Test-Declared-Length');
          if (declared === 'missing') request.headers.delete('Content-Length');
          else if (declared !== null) request.headers.set('Content-Length', declared);
          if (request.headers.has('X-Test-Storage-Failure')) {
            const bucket = env.PDF_UPLOADS;
            const failCleanup = request.headers.get('X-Test-Storage-Failure') === 'cleanup';
            env = { ...env, PDF_UPLOADS: {
              put: async () => { throw new Error('Storage unavailable before reading'); },
              delete: async key => {
                if (failCleanup) throw new Error('Cleanup unavailable');
                return bucket.delete(key);
              },
            } };
          }
          return app.fetch(request, env);
        } };`,
    },
    ...await workerModules(),
  ],
  bindings: config.vars,
  r2Buckets: ['PDF_UPLOADS'],
  assets: {
    directory: assetDirectory,
    binding: config.assets.binding,
    run_worker_first: config.assets.run_worker_first,
    routerConfig: { has_user_worker: true },
    assetConfig: { not_found_handling: config.assets.not_found_handling },
  },
  outboundService: async request => {
    authRequests.push({ url: request.url, method: request.method, authorization: request.headers.get('Authorization') })
    return authResponse()
  },
}))

const fileContent = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
const endpoint = 'https://awremote.example.invalid/api/file-conversion/uploads'
function headers(overrides = {}) {
  return {
    Authorization: 'Bearer valid-session',
    'X-PocketBase-Url': config.vars.POCKETBASE_URL,
    'X-File-Name': encodeURIComponent('讲义.pdf'),
    'Content-Type': 'application/pdf',
    ...overrides,
  }
}
function upload(overrides = {}, body = fileContent) {
  return worker.dispatchFetch(endpoint, { method: 'PUT', headers: headers(overrides), body, duplex: 'half' })
}
async function expectError(response, status, code) {
  assert.equal(response.status, status, await response.clone().text())
  assert.equal((await response.json()).code, code)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
}
function byteStream(content) {
  const bytes = new TextEncoder().encode(content)
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) controller.close()
      else controller.enqueue(bytes.slice(offset, ++offset))
    },
  })
}

try {
  const bucket = await worker.getR2Bucket('PDF_UPLOADS')
  await expectError(await upload({ Authorization: '' }), 401, 'AUTH_REQUIRED')
  await expectError(await upload({ Authorization: 'Bearer a b' }), 401, 'AUTH_REQUIRED')
  assert.equal(authRequests.length, 0)
  for (const origin of [
    'https://attacker.example',
    'http://127.0.0.1:8090',
    'https://pb.any1.tech.attacker.example',
    'https://pb.any1.tech@attacker.example',
    'https://pb.any1.tech/private',
    'https://pb.any1.tech/?redirect=https://attacker.example',
    '',
  ]) {
    await expectError(await upload({ 'X-PocketBase-Url': origin }), 400, 'UNSUPPORTED_POCKETBASE')
  }
  assert.equal(authRequests.length, 0, 'Untrusted origins must never receive a PocketBase token')

  authResponse = () => RuntimeResponse.json({ message: 'expired' }, { status: 403 })
  await expectError(await upload(), 401, 'AUTH_EXPIRED')
  authResponse = () => RuntimeResponse.json({ message: 'unavailable' }, { status: 503 })
  await expectError(await upload(), 502, 'AUTH_UNAVAILABLE')
  authResponse = () => new RuntimeResponse('invalid JSON')
  await expectError(await upload(), 502, 'INVALID_AUTH_RESPONSE')
  authResponse = () => RuntimeResponse.json({ record: { id: 'admin', collectionName: '_superusers' } })
  await expectError(await upload(), 502, 'INVALID_AUTH_RESPONSE')
  authResponse = () => new RuntimeResponse(null, { status: 302, headers: { Location: 'https://attacker.example' } })
  const callsBeforeRedirect = authRequests.length
  await expectError(await upload(), 502, 'AUTH_UNAVAILABLE')
  assert.equal(authRequests.length, callsBeforeRedirect + 1, 'Auth redirects must not forward the token elsewhere')
  authResponse = () => RuntimeResponse.json({ record: { id: 'client-1', collectionName: 'aw_clients' } })

  for (const fileName of ['notes.txt', '../notes.pdf', 'notes\\file.pdf', 'notes\n.pdf', '']) {
    await expectError(await upload({ 'X-File-Name': encodeURIComponent(fileName) }), 400, 'INVALID_FILE_NAME')
  }
  await expectError(await upload({ 'X-File-Name': '%ZZ' }), 400, 'INVALID_FILE_NAME')
  await expectError(await upload({ 'X-Test-Declared-Length': 'missing' }), 411, 'LENGTH_REQUIRED')
  await expectError(await upload({ 'X-Test-Declared-Length': '-1' }), 411, 'LENGTH_REQUIRED')
  await expectError(await upload({ 'X-Test-Declared-Length': String(90 * 1024 * 1024 + 1) }), 413, 'FILE_TOO_LARGE')
  await expectError(await upload({}, 'no PDF signature'), 400, 'INVALID_PDF')
  await expectError(await upload({ 'X-Test-Declared-Length': String(fileContent.length) }, byteStream('!PDF-1.7\n')), 400, 'INVALID_PDF')
  await expectError(await upload({ 'X-Test-Declared-Length': '5' }), 400, 'LENGTH_MISMATCH')
  await expectError(await upload({ 'X-Test-Declared-Length': String(fileContent.length + 1) }), 400, 'LENGTH_MISMATCH')
  for (const failure of ['put', 'cleanup']) {
    let timer
    try {
      const response = await Promise.race([
        upload({ 'X-Test-Storage-Failure': failure }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('R2 failure left the upload pump blocked')), 3000) }),
      ])
      await expectError(response, 502, 'STORAGE_UNAVAILABLE')
    } finally {
      clearTimeout(timer)
    }
  }
  assert.equal((await bucket.list()).objects.length, 0, 'Rejected requests must not leave public objects')

  const startedAt = Date.now()
  const response = await upload({
    'X-PocketBase-Url': `${config.vars.POCKETBASE_URL}/`,
    'X-Test-Declared-Length': String(fileContent.length),
  }, byteStream(fileContent))
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.fileName, '讲义.pdf')
  assert.equal(result.size, new TextEncoder().encode(fileContent).byteLength)
  assert.match(result.sourceUrl, /^https:\/\/ocr-files\.any1\.tech\/[a-f\d-]{36}\.pdf$/u)
  assert.ok(Date.parse(result.expiresAt) >= startedAt + 24 * 60 * 60 * 1000)
  assert.ok(Date.parse(result.expiresAt) <= Date.now() + 24 * 60 * 60 * 1000)
  const key = new URL(result.sourceUrl).pathname.slice(1)
  const stored = await bucket.get(key)
  assert.ok(stored)
  assert.equal(await stored.text(), fileContent)
  assert.equal(stored.httpMetadata.contentType, 'application/pdf')
  assert.equal(stored.httpMetadata.cacheControl, 'no-store')
  assert.deepEqual(stored.customMetadata, { expiresAt: result.expiresAt })
  const second = await (await upload()).json()
  assert.notEqual(second.sourceUrl, result.sourceUrl, 'Each upload needs an unpredictable, independent object key')
  assert.ok(authRequests.every(request => request.url === `${config.vars.POCKETBASE_URL}/api/collections/aw_clients/auth-refresh`))
  assert.ok(authRequests.every(request => request.method === 'POST' && request.authorization === 'valid-session'))

  const wrongMethod = await worker.dispatchFetch(endpoint, { method: 'GET' })
  assert.equal(wrongMethod.headers.get('Allow'), 'PUT')
  await expectError(wrongMethod, 405, 'METHOD_NOT_ALLOWED')
  const unknownApi = await worker.dispatchFetch('https://awremote.example.invalid/api/missing', { headers: { Accept: 'text/html' } })
  await expectError(unknownApi, 404, 'NOT_FOUND')
  const spa = await worker.dispatchFetch('https://awremote.example.invalid/file-conversion', { headers: { Accept: 'text/html' } })
  assert.equal(spa.status, 200)
  assert.match(await spa.text(), /AnyWorkflow upload test/u)
  console.log('upload-worker: workerd auth allowlist, PDF stream/size validation, R2 metadata and SPA routing passed')
} finally {
  await worker.dispose()
  await rm(assetDirectory, { recursive: true, force: true })
}
