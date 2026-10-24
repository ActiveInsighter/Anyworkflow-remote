import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
const calls = []
let upstreamStatus = 200, released = false
const worker = new Miniflare(convertV4MiniflareOptions({
  name: config.name, compatibilityDate: config.compatibility_date,
  modules: [{ type: 'ESModule', path: 'download-entry.js', contents: "export { default } from './worker/index.js'" }, ...await workerModules()],
  bindings: config.vars,
  outboundService: request => {
    const url = new URL(request.url)
    calls.push({ origin: url.origin, path: url.pathname, range: request.headers.get('range'), ifRange: request.headers.get('if-range'), auth: request.headers.get('authorization') })
    assert.equal(url.origin, config.vars.POCKETBASE_URL)
    assert.equal(url.searchParams.get('token'), 'short-lived-token')
    assert.equal(request.headers.has('authorization'), false)
    if (upstreamStatus !== 200) return new Response(null, { status: upstreamStatus, headers: { 'Content-Range': 'bytes */8' } })
    if (request.headers.has('range')) return new Response(Uint8Array.of(3, 4), {
      status: 206, headers: { 'Content-Range': 'bytes 2-3/8', 'Content-Length': '2', 'Accept-Ranges': 'bytes', ETag: '"zip-v1"' },
    })
    if (request.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': '8', 'Accept-Ranges': 'bytes' } })
    return new Response(new ReadableStream({
      async start(controller) {
        controller.enqueue(Uint8Array.of(80, 75, 3, 4))
        while (!released) await new Promise(resolve => setTimeout(resolve, 10))
        controller.enqueue(Uint8Array.of(1, 2, 3, 4))
        controller.close()
      },
    }), { headers: { 'Content-Length': '8', 'Accept-Ranges': 'bytes', ETag: '"zip-v1"' } })
  },
}))
const params = new URLSearchParams({ job: 'aaaaaaaaaaaaaaa', file: 'result_random.zip', token: 'short-lived-token', name: '数学笔记.zip' })
const url = `https://remote.invalid/api/file-conversion/download?${params}`
try {
  const missing = new URL(url); missing.searchParams.delete('token')
  assert.equal((await worker.dispatchFetch(missing)).status, 401)
  const traversal = new URL(url); traversal.searchParams.set('file', '../private.zip')
  assert.equal((await worker.dispatchFetch(traversal)).status, 400)
  assert.equal((await worker.dispatchFetch(url, { method: 'POST' })).status, 405)
  assert.equal(calls.length, 0, 'invalid requests never reach the origin')
  const response = await worker.dispatchFetch(url)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-disposition'), /filename\*=UTF-8''%E6%95%B0/u)
  assert.equal(response.headers.get('content-length'), '8')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const reader = response.body.getReader()
  const first = await Promise.race([reader.read(), new Promise((_, reject) => setTimeout(() => reject(new Error('Worker buffered the ZIP')), 3000))])
  assert.deepEqual([...first.value], [80, 75, 3, 4])
  assert.equal(released, false, 'response reaches the client before the archive is complete')
  released = true
  let size = first.value.length
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length }
  assert.equal(size, 8)
  const range = await worker.dispatchFetch(url, { headers: { Range: 'bytes=2-3', 'If-Range': '"zip-v1"' } })
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('content-range'), 'bytes 2-3/8')
  assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [3, 4])
  assert.equal(calls.at(-1).range, 'bytes=2-3')
  assert.equal(calls.at(-1).ifRange, '"zip-v1"')
  const head = await worker.dispatchFetch(url, { method: 'HEAD' })
  assert.equal(head.headers.get('content-length'), '8')
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  upstreamStatus = 403
  const expired = await worker.dispatchFetch(url)
  assert.equal(expired.status, 403)
  assert.equal(expired.headers.has('content-disposition'), false, 'auth failures must not download a JSON file as ZIP')
  upstreamStatus = 302
  assert.equal((await worker.dispatchFetch(url)).status, 502, 'origin redirects are never followed')
  console.log('download-worker: immediate streaming, protected file authorization, filenames, Range/If-Range, HEAD and redirect rejection passed')
} finally { released = true; await worker.dispose() }
