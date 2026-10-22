import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
const secret = 'relay-secret-'.padEnd(48, 'x')
const outbound = []
const modules = await workerModules()
function relayWorker(bindings) {
  return new Miniflare(convertV4MiniflareOptions({
    name: config.name,
    compatibilityDate: config.compatibility_date,
    modules: [
      { type: 'ESModule', path: 'relay-test-entry.js', contents: "export { default } from './worker/index.js'" },
      ...modules,
    ],
    bindings: { ...config.vars, ...bindings },
    r2Buckets: ['PDF_UPLOADS'],
    outboundService: request => {
      outbound.push(request.url)
      return new Response(null, { status: 599 })
    },
  }))
}

const endpoint = 'https://awremote.example.invalid/api/file-conversion/relay'
const pdf = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
function relay(worker, authorization, body = pdf) {
  return worker.dispatchFetch(endpoint, {
    method: 'PUT',
    headers: { Authorization: authorization, 'X-File-Name': 'pages-1-25.pdf', 'Content-Type': 'application/pdf' },
    body,
    duplex: 'half',
  })
}
async function expectError(response, status, code) {
  assert.equal(response.status, status, await response.clone().text())
  assert.equal((await response.json()).code, code)
}

const disabled = relayWorker({})
const worker = relayWorker({ RELAY_UPLOAD_SECRET: secret })
try {
  await expectError(await relay(disabled, `Bearer ${secret}`), 404, 'NOT_FOUND')
  await expectError(await relay(worker, ''), 401, 'AUTH_REQUIRED')
  await expectError(await relay(worker, `Bearer ${secret}x`), 401, 'AUTH_REQUIRED')
  await expectError(await relay(worker, 'Bearer short'), 401, 'AUTH_REQUIRED')
  await expectError(await relay(worker, `Bearer ${secret}`, 'not a pdf'), 400, 'INVALID_PDF')
  await expectError(await worker.dispatchFetch(endpoint, { method: 'POST' }), 405, 'METHOD_NOT_ALLOWED')

  const response = await relay(worker, `Bearer ${secret}`)
  assert.equal(response.status, 201, await response.clone().text())
  const result = await response.json()
  assert.match(result.sourceUrl, new RegExp(`^${config.vars.PDF_PUBLIC_BASE_URL}/[0-9a-f-]{36}\\.pdf$`, 'u'))
  const stored = await (await worker.getR2Bucket('PDF_UPLOADS')).get(result.sourceUrl.split('/').at(-1))
  assert.equal(await stored.text(), pdf)
  assert.equal(stored.httpMetadata.cacheControl, 'no-store')
  assert.deepEqual(outbound, [], 'the runner secret never reaches PocketBase or any other service')
  console.log('upload-worker-relay: secret-gated relay route, PDF validation and R2 storage passed')
} finally {
  await Promise.all([disabled.dispose(), worker.dispose()])
}
