import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { archiveFiles, buildManifest, createBridge, createPublisher, MAX_ASSETS, CHUNK_SIZE } from './archive-files.mjs'

const record = n => {
  const sha256 = createHash('sha256').update(String(n)).digest('hex')
  return { v: 1, scope: 'library', key: `${n}.pdf`, size: 5, etag: String(n), chunks: [{ hash: sha256.slice(0, 32), sha256, size: 5 }] }
}
const records = Array.from({ length: MAX_ASSETS }, (_, n) => record(n))
assert.equal(Object.keys(buildManifest(records)).length, MAX_ASSETS)
assert.throws(() => buildManifest([...records, record(MAX_ASSETS)]), /capacity/u)
assert.equal(Object.keys(buildManifest([record(1), { ...record(1), key: 'duplicate.pdf' }])).length, 1, 'content is deduplicated')
assert.throws(() => buildManifest([{ ...record(1), size: CHUNK_SIZE + 1 }]), /Invalid archive/u)
assert.throws(() => buildManifest([{ ...record(1), chunks: [{ ...record(1).chunks[0], sha256: 'b'.repeat(64) }] }]), /Invalid archive/u)
const collision = { ...record(1), chunks: [{ ...record(1).chunks[0], sha256: record(1).chunks[0].sha256.slice(0, 32) + '0'.repeat(32) }] }
assert.throws(() => buildManifest([record(1), collision]), /collision/u)

let commits = 0, released = false
const bridge = {
  async acquire() { return { token: 'lease', expiresAt: 1 } },
  async release() { released = true },
  async records() { return records },
  async* candidates() { yield { key: 'new.pdf', size: 5 } },
  async source() { throw new Error('capacity admission must precede download') },
  async commit() { commits++ },
}
await assert.rejects(() => archiveFiles({ bridge, publisher: { async checkLifecycles() {} }, cache: {} }), /capacity/u)
assert.equal(commits, 0)
assert.equal(released, true)

// Bootstrap must never redeploy an existing archive from an empty local asset directory.
let writes = 0
const publisher = createPublisher({ accountId: '1'.repeat(32), apiToken: 'token', fetcher: async (_url, init) => {
  if (init.method === 'PUT') writes++
  return Response.json({ success: true, result: {} })
} })
await publisher.bootstrap()
assert.equal(writes, 0)
const forbidden = createPublisher({ accountId: '1'.repeat(32), apiToken: 'token', fetcher: async () => new Response(null, { status: 403 }) })
await assert.rejects(() => forbidden.bootstrap(), /HTTP 403/u)
console.log('archive-files: capacity admission, complete manifests, deduplication, invalid chunks, collision detection, lease cleanup and bootstrap preservation passed')

let reads = 0, waits = 0
const propagating = createBridge({ baseUrl: 'https://gateway.invalid', secret: 'test-secret', retryDelay: async () => { waits++ }, fetcher: async () => ++reads === 1 ? new Response(null, { status: 404 }) : new Response('chunk') })
assert.equal((await propagating.chunk('a'.repeat(32))).toString(), 'chunk')
assert.equal(reads, 2)
assert.equal(waits, 1)
let deniedReads = 0
const denied = createBridge({ baseUrl: 'https://gateway.invalid', secret: 'test-secret', retryDelay: async () => { throw new Error('auth failures must not retry') }, fetcher: async () => { deniedReads++; return new Response(null, { status: 401 }) } })
await assert.rejects(() => denied.chunk('b'.repeat(32)), /HTTP 401/u)
assert.equal(deniedReads, 1)
console.log('archive-files: bounded propagation retry and immediate auth failure passed')
