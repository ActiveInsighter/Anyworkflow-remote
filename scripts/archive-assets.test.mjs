import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { Miniflare, convertV4MiniflareOptions, Response as RuntimeResponse } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'
import { CHUNK_SIZE } from './archive-files.mjs'

const directory = await mkdtemp(new URL('../.archive-work-', import.meta.url))
const bytes = randomBytes(CHUNK_SIZE + 32)
bytes.set(Buffer.from('%PDF-1.7\n'))
const chunks = [bytes.subarray(0, CHUNK_SIZE), bytes.subarray(CHUNK_SIZE)].map(content => {
  const sha256 = createHash('sha256').update(content).digest('hex')
  return { content, hash: sha256.slice(0, 32), sha256, size: content.length }
})
await mkdir(path.join(directory, 'chunks'))
for (const chunk of chunks) await writeFile(path.join(directory, 'chunks', `${chunk.hash}.bin`), chunk.content)
const assets = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-10-28',
  modules: [{ type: 'ESModule', path: 'index.js', contents: await readFile(new URL('../archive-worker/index.js', import.meta.url), 'utf8') }],
  assets: { directory, binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true }, assetConfig: { html_handling: 'none', not_found_handling: 'none' } },
}))
const gateway = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-09-18',
  modules: [{ type: 'ESModule', path: 'entry.js', contents: `import app from './worker/index.js'; export default app;` }, ...await workerModules()],
  bindings: { PDF_PUBLIC_BASE_URL: 'https://ocr-files.any1.tech' },
  r2Buckets: ['LIBRARY_FILES', 'PDF_UPLOADS'],
  serviceBindings: { PDF_ARCHIVE: async request => {
    const response = await assets.dispatchFetch(request.url, { method: request.method, headers: request.headers })
    return new RuntimeResponse(response.body, { status: response.status, headers: response.headers })
  } },
}))
try {
  const key = '00000000-0000-4000-8000-000000000001.pdf'
  const bucket = await gateway.getR2Bucket('LIBRARY_FILES')
  await bucket.put(`archives/${key}.json`, JSON.stringify({ v: 1, scope: 'library', key, size: bytes.length, etag: 'original', httpEtag: '"original"', uploaded: new Date().toISOString(), customMetadata: { owner: 'owner', fileName: 'native.pdf' }, chunks: chunks.map(({ content, ...entry }) => entry) }))
  const source = `https://remote.example.invalid/api/library/sources/${key}`
  const all = await gateway.dispatchFetch(source)
  assert.equal(all.status, 200)
  assert.deepEqual(Buffer.from(await all.arrayBuffer()), bytes)
  const partial = await gateway.dispatchFetch(source, { headers: { Range: `bytes=${CHUNK_SIZE - 4}-${CHUNK_SIZE + 8}` } })
  assert.equal(partial.status, 206)
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(CHUNK_SIZE - 4, CHUNK_SIZE + 9))
  const invalid = await assets.dispatchFetch('https://archive.internal/archives/metadata.json')
  assert.equal(invalid.status, 404)
  console.log('archive-assets: native workerd ASSETS binding and real archive service code passed complete streaming and cross-chunk Range through gateway')
} finally {
  await gateway.dispose()
  await assets.dispose()
  await rm(directory, { recursive: true, force: true })
}
