import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions, Response as RuntimeResponse } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'

const base = 'https://preview.example.invalid'
const path = '/api/library/files'
const pdf = '%PDF-1.7\nReusable library fixture\n%%EOF'
const headers = (token = 'owner-1') => ({ Authorization: `Bearer ${token}`, 'X-PocketBase-Url': 'https://pb.any1.tech', 'Content-Type': 'application/json' })
let jobs = []
const worker = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-09-18',
  modules: [{ type: 'ESModule', path: 'entry.js', contents: `import app from './worker/index.js'; export default app;` }, ...await workerModules()],
  bindings: { POCKETBASE_URL: 'https://pb.any1.tech', PDF_PUBLIC_BASE_URL: 'https://ocr-files.any1.tech', UPLOAD_TICKET_SECRET: randomBytes(32).toString('base64url') },
  r2Buckets: ['PDF_UPLOADS', 'LIBRARY_FILES'],
  outboundService: async request => {
    const owner = request.headers.get('Authorization')
    if (owner === 'expired') return RuntimeResponse.json({}, { status: 401 })
    if (new URL(request.url).pathname.endsWith('/auth-refresh')) return RuntimeResponse.json({ record: { id: owner, collectionName: 'aw_clients' } })
    return RuntimeResponse.json({ items: jobs.filter(job => job.owner === owner), totalPages: 1 })
  },
}))
const call = (url, options = {}) => worker.dispatchFetch(`${base}${url}`, { headers: headers(), ...options })
try {
  const pending = await call(`${path}/uploads/multipart`, { method: 'POST', body: JSON.stringify({ fileName: '复用讲义.pdf', size: pdf.length }) })
  assert.equal(pending.status, 201, await pending.clone().text())
  const session = await pending.json()
  const ticketHeaders = { ...headers(), 'X-Upload-Ticket': session.ticket }
  const uploadPath = `${path}/uploads/multipart/${encodeURIComponent(session.uploadId)}`
  assert.equal((await call(uploadPath + '/parts/1', { method: 'PUT', headers: { ...ticketHeaders, 'Content-Type': 'application/octet-stream' }, body: pdf })).status, 200)
  const partResponse = await call(uploadPath + '/parts/1', { method: 'PUT', headers: { ...ticketHeaders, 'Content-Type': 'application/octet-stream' }, body: pdf })
  const parts = [await partResponse.json()]
  const complete = () => call(uploadPath + '/complete', { method: 'POST', headers: ticketHeaders, body: JSON.stringify({ parts }) })
  const result = await complete()
  assert.equal(result.status, 201, await result.clone().text())
  const file = await result.json()
  assert.equal(file.expiresAt, '')
  assert.equal(file.fileName, '复用讲义.pdf')
  assert.equal(file.sourceUrl, `${base}/api/library/sources/${file.id}`)
  assert.equal((await (await complete()).json()).id, file.id, 'complete is idempotent')
  assert.equal((await (await call(path)).json()).items.length, 1)
  assert.equal((await (await call(path, { headers: headers('owner-2') })).json()).items.length, 0)
  for (const method of ['GET', 'DELETE']) assert.equal((await call(`${path}/${file.id}`, { method, headers: headers('owner-2') })).status, 404)
  assert.equal((await call(path, { headers: {} })).status, 401)
  assert.equal((await call(path, { headers: headers('expired') })).status, 401)
  const publicPath = new URL(file.sourceUrl).pathname
  for (let job = 0; job < 2; job++) {
    const source = await call(publicPath, { headers: {} })
    assert.equal(source.status, 200)
    assert.equal(source.headers.get('cache-control'), 'no-store')
    assert.equal(await source.text(), pdf)
  }
  const head = await call(publicPath, { method: 'HEAD', headers: {} })
  assert.equal(Number(head.headers.get('content-length')), pdf.length)
  assert.equal(await head.text(), '')
  const partial = await call(publicPath, { headers: { Range: 'bytes=0-4', 'If-Range': head.headers.get('etag') } })
  assert.equal(partial.status, 206)
  assert.equal(partial.headers.get('content-range'), `bytes 0-4/${pdf.length}`)
  assert.equal(await partial.text(), '%PDF-')
  assert.equal(await (await call(publicPath, { headers: { Range: 'bytes=-5' } })).text(), pdf.slice(-5))
  const changed = await call(publicPath, { headers: { Range: 'bytes=0-4', 'If-Range': '"stale"' } })
  assert.equal(changed.status, 200)
  assert.equal(await changed.text(), pdf)
  assert.equal((await call(publicPath, { headers: { Range: 'bytes=9000-9999' } })).status, 416)
  assert.equal((await call(`/api/file-conversion/uploads/multipart/${encodeURIComponent(session.uploadId)}/complete`, { method: 'POST', headers: ticketHeaders, body: JSON.stringify({ parts }) })).status, 400, 'library tickets cannot address temporary storage')

  const bucket = await worker.getR2Bucket('LIBRARY_FILES')
  const stored = await bucket.head(file.id)
  assert.equal(stored.customMetadata.owner, 'owner-1')
  assert.equal(await (await worker.getR2Bucket('PDF_UPLOADS')).head(file.id), null)

  const folders = '/api/library/folders'
  const json = async response => { assert.ok(response.ok, `${response.status} ${await response.clone().text()}`); return response.status === 204 ? null : response.json() }
  const outer = await json(await call(folders, { method: 'POST', body: JSON.stringify({ name: ' 讲义 ' }) }))
  assert.equal(outer.name, '讲义')
  assert.equal(outer.parent, '')
  const inner = await json(await call(folders, { method: 'POST', body: JSON.stringify({ name: '第一章', parent: outer.id }) }))
  assert.equal((await call(folders, { method: 'POST', body: JSON.stringify({ name: '  ' }) })).status, 400)
  assert.equal((await call(folders, { method: 'POST', body: JSON.stringify({ name: '孤儿', parent: '00000000-0000-4000-8000-000000000000' }) })).status, 404)
  assert.equal((await call(`${folders}/${outer.id}`, { method: 'PATCH', body: JSON.stringify({ parent: inner.id }) })).status, 400, 'a folder cannot move under its own child')
  assert.equal((await json(await call(`${folders}/${inner.id}`, { method: 'PATCH', body: JSON.stringify({ name: '第 1 章' }) }))).name, '第 1 章')
  assert.equal((await json(await call(folders, { headers: headers('owner-2') }))).items.length, 0, 'folders are private')
  assert.equal((await call(`${folders}/${inner.id}`, { method: 'PATCH', headers: headers('owner-2'), body: JSON.stringify({ name: 'x' }) })).status, 404)
  const moved = await json(await call(`${path}/${file.id}`, { method: 'PATCH', body: JSON.stringify({ folder: inner.id, fileName: '重命名讲义.pdf' }) }))
  assert.equal(moved.folder, inner.id)
  assert.equal(moved.fileName, '重命名讲义.pdf')
  assert.equal((await json(await call(`${path}/${file.id}`))).fileName, '重命名讲义.pdf')
  assert.equal((await (await complete()).json()).fileName, '重命名讲义.pdf', 'a repeated complete keeps the rename')
  assert.equal((await call(`${path}/${file.id}`, { method: 'PATCH', body: JSON.stringify({ folder: '00000000-0000-4000-8000-000000000000' }) })).status, 404)
  assert.equal((await call(`${path}/${file.id}`, { method: 'PATCH', headers: headers('owner-2'), body: JSON.stringify({ fileName: 'x.pdf' }) })).status, 404)
  assert.equal((await json(await call(path))).items[0].folder, inner.id)
  await json(await call(`${folders}/${inner.id}`, { method: 'DELETE' }))
  assert.equal((await json(await call(path))).items[0].folder, outer.id, 'deleting a folder moves its files up one level')
  await json(await call(`${folders}/${outer.id}`, { method: 'DELETE' }))
  assert.equal((await json(await call(path))).items[0].folder, '')
  assert.deepEqual((await json(await call(folders))).items, [])
  assert.equal((await call(`${path}/${file.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await call(`${path}/${file.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await call(publicPath, { headers: {} })).status, 410)
  assert.equal((await complete()).status, 410, 'delayed completion never resurrects deleted files')
  assert.deepEqual((await (await call(path)).json()).items, [])

  const legacy = await worker.getR2Bucket('PDF_UPLOADS')
  const oldId = '11111111-1111-4111-8111-111111111111.pdf'
  await legacy.put(oldId, pdf)
  jobs = [{ owner: 'owner-1', title: '旧上传', sourceUrl: `https://ocr-files.any1.tech/${oldId}` }, { owner: 'owner-1', title: '失效上传', sourceUrl: 'https://ocr-files.any1.tech/22222222-2222-4222-8222-222222222222.pdf' }]
  const imported = await (await call(path + '/import', { method: 'POST' })).json()
  assert.equal(imported.imported, 1)
  assert.equal(imported.unavailable, 1)
  assert.equal(imported.done, true)
  assert.equal((await (await call(path + '/import', { method: 'POST' })).json()).imported, 1)
  const migrated = (await (await call(path)).json()).items[0]
  assert.equal(await (await call(new URL(migrated.sourceUrl).pathname, { headers: {} })).text(), pdf)
  assert.equal((await (await call(path, { headers: headers('owner-2') })).json()).items.length, 0)
  assert.ok(await legacy.head(oldId), 'migration leaves the old source intact')
  const indexKeys = []
  for (let index = 0; index < 105; index++) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}.pdf`
    const key = `owners/owner-1/${id}`
    indexKeys.push(key)
    await bucket.put(key, '', { customMetadata: { id, fileName: index === 104 ? '跨页搜索目标.pdf' : `文件${index}.pdf`, size: '10', createdAt: new Date().toISOString() } })
  }
  const firstPage = await (await call(path)).json()
  assert.equal(firstPage.items.length, 100)
  assert.ok(firstPage.cursor)
  const search = await (await call(`${path}?q=${encodeURIComponent('跨页搜索目标')}`)).json()
  assert.equal(search.items.length, 1, 'search reaches files beyond the first page')
  assert.equal(search.items[0].fileName, '跨页搜索目标.pdf')
  await bucket.delete(indexKeys)
  console.log('library-worker: durable upload, owner isolation, reuse, ranges, idempotent deletion, ticket separation and legacy import, folders and rename/move passed')
} finally { await worker.dispose() }
