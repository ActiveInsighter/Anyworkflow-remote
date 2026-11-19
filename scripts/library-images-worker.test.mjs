import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions, Response as RuntimeResponse } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'

const base = 'https://preview.example.invalid'
const path = '/api/library/images'
const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const jpgBytes = Buffer.from('ffd8ffe000104a464946000101010048', 'hex')
const headers = (token = 'owner-1', extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'X-PocketBase-Url': 'https://pb.any1.tech',
  ...extra,
})

const worker = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-09-18',
  modules: [{ type: 'ESModule', path: 'entry.js', contents: `import app from './worker/index.js'; export default app;` }, ...await workerModules()],
  bindings: {
    POCKETBASE_URL: 'https://pb.any1.tech',
    PDF_PUBLIC_BASE_URL: 'https://ocr-files.any1.tech',
    UPLOAD_TICKET_SECRET: randomBytes(32).toString('base64url'),
  },
  r2Buckets: ['PDF_UPLOADS', 'LIBRARY_FILES'],
  outboundService: async request => {
    const owner = request.headers.get('Authorization')
    if (owner === 'expired') return RuntimeResponse.json({}, { status: 401 })
    if (new URL(request.url).pathname.endsWith('/auth-refresh')) {
      return RuntimeResponse.json({ record: { id: owner, collectionName: 'aw_clients' } })
    }
    return RuntimeResponse.json({ items: [], totalPages: 1 })
  },
}))

const call = (url, options = {}) => worker.dispatchFetch(`${base}${url}`, { headers: headers(), ...options })

try {
  // Reject non-image types
  const badType = await call(path, {
    method: 'PUT',
    headers: headers('owner-1', { 'Content-Type': 'application/pdf', 'X-File-Name': 'test.pdf' }),
    body: pngBytes,
  })
  assert.equal(badType.status, 400)

  // Upload PNG
  const res1 = await call(path, {
    method: 'PUT',
    headers: headers('owner-1', { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('草图.png') }),
    body: pngBytes,
  })
  assert.equal(res1.status, 201, await res1.clone().text())
  const img1 = await res1.json()
  assert.equal(img1.fileName, '草图.png')
  assert.equal(img1.mimeType, 'image/png')
  assert.equal(img1.size, pngBytes.length)
  assert.ok(img1.sourceUrl.startsWith(`${base}/api/library/image-sources/`))

  // Small delay so createdAt/reverseTs differs
  await new Promise(resolve => setTimeout(resolve, 10))

  // Upload JPEG
  const res2 = await call(path, {
    method: 'PUT',
    headers: headers('owner-1', { 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('photo.jpg') }),
    body: jpgBytes,
  })
  assert.equal(res2.status, 201)
  const img2 = await res2.json()

  // Isolation: PDF_UPLOADS bucket is untouched; /api/library/files is untouched
  assert.equal(await (await worker.getR2Bucket('PDF_UPLOADS')).head(`images/${img1.id}`), null)
  assert.equal((await (await call('/api/library/files')).json()).items.length, 0)

  // List images: newest first by default
  const listRes = await call(path)
  assert.equal(listRes.status, 200)
  const list = await listRes.json()
  assert.equal(list.items.length, 2)
  assert.equal(list.items[0].id, img2.id)
  assert.equal(list.items[1].id, img1.id)

  // List oldest first
  const oldestList = await (await call(`${path}?sort=oldest`)).json()
  assert.equal(oldestList.items[0].id, img1.id)

  // Search query
  const searchList = await (await call(`${path}?q=${encodeURIComponent('草图')}`)).json()
  assert.equal(searchList.items.length, 1)
  assert.equal(searchList.items[0].id, img1.id)

  // Owner isolation
  assert.equal((await (await call(path, { headers: headers('owner-2') })).json()).items.length, 0)
  assert.equal((await call(`${path}/${img1.id}`, { headers: headers('owner-2') })).status, 404)
  assert.equal((await call(`${path}/${img1.id}`, { method: 'DELETE', headers: headers('owner-2') })).status, 404)

  // Public capability source URL works without auth
  const srcPath = new URL(img1.sourceUrl).pathname
  const srcRes = await call(srcPath, { headers: {} })
  assert.equal(srcRes.status, 200)
  assert.equal(srcRes.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await srcRes.arrayBuffer()), pngBytes)

  // Delete image
  const delRes = await call(`${path}/${img1.id}`, { method: 'DELETE' })
  assert.equal(delRes.status, 204)
  assert.equal((await call(srcPath, { headers: {} })).status, 410)
  assert.equal((await (await call(path)).json()).items.length, 1)

  console.log('library-images-worker.test.mjs passed')
} finally {
  await worker.dispose()
}
