import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions, Response as RuntimeResponse } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'

const base = 'https://preview.example.invalid'
const path = '/api/library/images'
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const headers = (token = 'owner-1') => ({ Authorization: `Bearer ${token}`, 'X-PocketBase-Url': 'https://pb.any1.tech' })

const worker = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-09-18',
  modules: [{ type: 'ESModule', path: 'entry.js', contents: `import app from './worker/index.js'; export default app;` }, ...await workerModules()],
  bindings: { POCKETBASE_URL: 'https://pb.any1.tech', PDF_PUBLIC_BASE_URL: 'https://ocr-files.any1.tech', UPLOAD_TICKET_SECRET: randomBytes(32).toString('base64url') },
  r2Buckets: ['PDF_UPLOADS', 'LIBRARY_FILES'],
  outboundService: async request => {
    const owner = request.headers.get('Authorization')
    if (owner === 'expired') return RuntimeResponse.json({}, { status: 401 })
    return RuntimeResponse.json({ record: { id: owner, collectionName: 'aw_clients' } })
  },
}))

const call = (url, options = {}) => worker.dispatchFetch(`${base}${url}`, { headers: headers(), ...options })

try {
  // Auth checks
  assert.equal((await call(path, { headers: {} })).status, 401)
  assert.equal((await call(path, { headers: headers('expired') })).status, 401)

  // Unsupported type & empty body
  assert.equal((await call(path, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/pdf' }, body: png })).status, 415)
  assert.equal((await call(path, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'image/png' }, body: new Uint8Array(0) })).status, 400)

  // Upload two images with a slight delay so reverse-timestamp order is deterministic
  const up1 = await call(path, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('草图 1.png') },
    body: png,
  })
  assert.equal(up1.status, 201, await up1.clone().text())
  const img1 = await up1.json()
  assert.ok(img1.id.endsWith('.png'))
  assert.equal(img1.fileName, '草图 1.png')
  assert.equal(img1.mimeType, 'image/png')
  assert.equal(img1.size, png.length)
  assert.equal(img1.sourceUrl, `${base}/api/library/images/sources/${img1.id}`)

  await new Promise(resolve => setTimeout(resolve, 10))

  const up2 = await call(path, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('photo.jpg') },
    body: jpg,
  })
  assert.equal(up2.status, 201, await up2.clone().text())
  const img2 = await up2.json()
  assert.ok(img2.id.endsWith('.jpg'))

  // List is newest-first and isolated from PDF/MD library & PDF_UPLOADS
  const listed = await (await call(path)).json()
  assert.deepEqual(listed.items.map(i => i.id), [img2.id, img1.id])
  assert.equal((await (await call('/api/library/files')).json()).items.length, 0, 'images do not appear in file library')
  assert.equal((await (await call(path, { headers: headers('owner-2') })).json()).items.length, 0, 'owner isolated')

  const libraryBucket = await worker.getR2Bucket('LIBRARY_FILES')
  const pdfBucket = await worker.getR2Bucket('PDF_UPLOADS')
  assert.ok(await libraryBucket.head(`chat-images/${img1.id}`))
  assert.equal(await pdfBucket.head(`chat-images/${img1.id}`), null, 'isolated from file conversion bucket')

  // Search filter
  const searched = await (await call(`${path}?q=${encodeURIComponent('草图')}`)).json()
  assert.deepEqual(searched.items.map(i => i.id), [img1.id])

  // Public capability source URL
  const publicPath = new URL(img1.sourceUrl).pathname
  const fetched = await call(publicPath, { headers: {} })
  assert.equal(fetched.status, 200)
  assert.equal(fetched.headers.get('content-type'), 'image/png')
  assert.equal(fetched.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()), png)

  const head = await call(publicPath, { method: 'HEAD', headers: {} })
  assert.equal(head.status, 200)
  assert.equal(Number(head.headers.get('content-length')), png.length)

  // Owner isolation on item GET/DELETE
  assert.equal((await call(`${path}/${img1.id}`, { headers: headers('owner-2') })).status, 404)
  assert.equal((await call(`${path}/${img1.id}`, { method: 'DELETE', headers: headers('owner-2') })).status, 404)

  // Delete image
  assert.equal((await call(`${path}/${img1.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await call(publicPath, { headers: {} })).status, 404)
  const afterDelete = await (await call(path)).json()
  assert.deepEqual(afterDelete.items.map(i => i.id), [img2.id])

  console.log('library-images-worker: upload, newest-first listing, search, isolation, public source, and delete passed')
} finally {
  await worker.dispose()
}
