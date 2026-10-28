import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions, Response as RuntimeResponse } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'
import { archiveFiles, createBridge, createPublisher, CHUNK_SIZE, assetPath } from './archive-files.mjs'

const secret = randomBytes(32).toString('hex')
const accountId = '1'.repeat(32)
const baseUrl = 'https://remote.example.invalid'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}.pdf`
let assets = new Map()
let unavailableHash
let corruptHash
let serveFailure = false
let archiveReads = 0
const runtime = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-09-18',
  modules: [{ type: 'ESModule', path: 'entry.js', contents: `import app from './worker/index.js';
    const now = Date.now; let delta = 25 * 60 * 60 * 1000; Date.now = () => now() + delta;
    export default { fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname === '/__test/clock') { delta = Number(url.searchParams.get('delta')); return new Response(null, { status: 204 }); }
      const service = env.PDF_ARCHIVE;
      env = { ...env, PDF_ARCHIVE: { async fetch(...args) {
        const response = await service.fetch(...args);
        const headers = new Headers(response.headers); headers.delete('Content-Length');
        return new Response(response.body, { status: response.status, headers });
      } } };
      return app.fetch(request, env, ctx);
    } };` }, ...await workerModules()],
  bindings: { POCKETBASE_URL: 'https://pb.any1.tech', PDF_PUBLIC_BASE_URL: 'https://ocr-files.any1.tech', UPLOAD_TICKET_SECRET: secret, ARCHIVE_ADMIN_SECRET: secret },
  r2Buckets: ['LIBRARY_FILES', 'PDF_UPLOADS'],
  serviceBindings: {
    PDF_ARCHIVE: async request => {
      archiveReads++
      const pathname = new URL(request.url).pathname
      const bytes = assets.get(pathname)
      if (serveFailure || pathname === assetPath(unavailableHash) || !bytes) return new RuntimeResponse(null, { status: 404 })
      const content = pathname === assetPath(corruptHash) ? Buffer.alloc(bytes.length) : bytes
      assert.equal(request.headers.get('Range'), null, 'gateway reads complete immutable chunks rather than relying on production asset Range behavior')
      const range = /^bytes=(\d+)-(\d+)$/u.exec(request.headers.get('Range') || '')
      if (!range) return new RuntimeResponse(content, { headers: { 'Content-Length': String(content.length) } })
      const from = Number(range[1]), to = Number(range[2])
      return new RuntimeResponse(content.subarray(from, to + 1), { status: 206, headers: { 'Content-Range': `bytes ${from}-${to}/${content.length}`, 'Content-Length': String(to - from + 1) } })
    },
  },
  outboundService: request => RuntimeResponse.json({ record: { id: request.headers.get('Authorization'), collectionName: 'aw_clients' } }),
}))
const fetcher = (url, options) => runtime.dispatchFetch(String(url), options)
const bridge = () => createBridge({ baseUrl, secret, fetcher, retryDelay: async () => {} })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const cache = () => {
  const chunks = new Map()
  return { async put(hash, bytes) { chunks.set(hash, bytes) }, async get(hash) { return chunks.get(hash) ?? null } }
}
let uploadFailure = false
let deployFailure = false
let lifecycleExpiry = false
let lifecycleChecks = 0
let deployments = 0
let uploads = new Map()
let sessionManifest
const cloud = async (url, init = {}) => {
  const pathname = new URL(url).pathname
  const good = result => Response.json({ success: true, result })
  if (pathname.endsWith('/lifecycle')) { lifecycleChecks++; if (!lifecycleExpiry && pathname.includes('anyworkflow-library')) return good({}); return good({ rules: lifecycleExpiry ? [{ enabled: true, deleteObjectsTransition: { condition: { maxAge: 86400, type: 'Age' } } }] : [] }) }
  if (pathname.endsWith('/assets-upload-session')) {
    sessionManifest = JSON.parse(init.body).manifest
    const missing = Object.values(sessionManifest).filter(e => !assets.has(assetPath(e.hash))).map(e => e.hash)
    uploads = new Map()
    return good({ jwt: 'upload-jwt', buckets: missing.length ? [missing] : [] })
  }
  if (pathname.endsWith('/assets/upload')) {
    if (uploadFailure) return new Response(null, { status: 503 })
    assert.equal(init.headers.Authorization, 'Bearer upload-jwt')
    for (const [hash, blob] of init.body) {
      const bytes = Buffer.from(await blob.text(), 'base64')
      assert.equal(digest(bytes).slice(0, 32), hash)
      uploads.set(assetPath(hash), bytes)
    }
    return good({ jwt: 'completion-jwt' })
  }
  if (pathname.endsWith('/subdomain')) { assert.deepEqual(JSON.parse(init.body), { enabled: false, previews_enabled: false }); return good({}) }
  if (init.method === 'PUT') {
    if (deployFailure) return new Response(null, { status: 503 })
    const metadata = JSON.parse(await init.body.get('metadata').text())
    assert.ok(['completion-jwt', 'upload-jwt'].includes(metadata.assets.jwt))
    assert.equal(metadata.assets.config.run_worker_first, true)
    const next = new Map()
    for (const [pathname, entry] of Object.entries(sessionManifest)) {
      const bytes = uploads.get(pathname) || assets.get(pathname)
      assert.ok(bytes, 'old assets must be retained by every deployment')
      assert.equal(bytes.length, entry.size)
      next.set(pathname, bytes)
    }
    assets = next
    deployments++
    return good({ id: `deployment-${deployments}` })
  }
  throw new Error('Unexpected Cloudflare API request')
}
const publisher = () => createPublisher({ accountId, apiToken: 'never-exposed-token', fetcher: cloud })
const run = () => archiveFiles({ bridge: bridge(), publisher: publisher(), cache: cache(), log() {} })
const publicCall = (key, init = {}) => runtime.dispatchFetch(`${baseUrl}/api/library/sources/${key}`, init)
const privateCall = (key, method = 'GET', token = 'owner') => runtime.dispatchFetch(`${baseUrl}/api/library/files/${key}`, { method, headers: { Authorization: `Bearer ${token}`, 'X-PocketBase-Url': 'https://pb.any1.tech' } })

// Valid PDF with a large unreferenced embedded stream; enough bytes to require two assets.
function largePdf() {
  const payload = randomBytes(CHUNK_SIZE + 2 * 1024 * 1024)
  const sections = [Buffer.from('%PDF-1.7\n')]
  const offsets = [0]
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    Buffer.concat([Buffer.from(`<< /Type /EmbeddedFile /Length ${payload.length} >>\nstream\n`), payload, Buffer.from('\nendstream')]),
  ]
  for (const [index, object] of objects.entries()) {
    offsets.push(sections.reduce((sum, b) => sum + b.length, 0))
    sections.push(Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(object), Buffer.from('\nendobj\n'))
  }
  const xref = sections.reduce((sum, b) => sum + b.length, 0)
  sections.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  return Buffer.concat(sections)
}
try {
  const bucket = await runtime.getR2Bucket('LIBRARY_FILES')
  const relay = await runtime.getR2Bucket('PDF_UPLOADS')
  const pdf = largePdf()
  await bucket.put(id(1), pdf, { customMetadata: { owner: 'owner', fileName: 'large.pdf' }, httpMetadata: { contentType: 'application/pdf' } })
  const initialHead = await publicCall(id(1), { method: 'HEAD' })
  assert.equal(initialHead.status, 200)
  assert.equal((await run()).archived, 1)
  assert.equal(await bucket.head(id(1)), null, 'only verified originals are deleted')
  const record = await (await bucket.get(`archives/${id(1)}.json`)).json()
  assert.equal(record.chunks.length, 2)
  assert.equal(record.chunks[0].size, CHUNK_SIZE)
  const reconstructed = Buffer.from(await (await publicCall(id(1))).arrayBuffer())
  assert.deepEqual(reconstructed, pdf)
  if (process.env.ARCHIVE_VALIDATION_OUTPUT) await writeFile(process.env.ARCHIVE_VALIDATION_OUTPUT, reconstructed)
  assert.equal((await publicCall(id(1), { method: 'HEAD' })).headers.get('etag'), initialHead.headers.get('etag'))
  assert.equal((await (await privateCall(id(1))).json()).fileName, 'large.pdf')
  assert.equal((await privateCall(id(1), 'GET', 'stranger')).status, 404)
  const rename = await runtime.dispatchFetch(`${baseUrl}/api/library/files/${id(1)}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'X-PocketBase-Url': 'https://pb.any1.tech', 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: 'renamed-after-archive.pdf' }),
  })
  assert.equal(rename.status, 200)
  assert.equal((await rename.json()).fileName, 'renamed-after-archive.pdf')
  assert.equal((await (await privateCall(id(1))).json()).fileName, 'renamed-after-archive.pdf')
  assert.equal(await bucket.head(id(1)), null, 'renaming an archived file never copies it back to R2')

  for (const [from, to] of [[0, 4], [CHUNK_SIZE - 11, CHUNK_SIZE + 15], [CHUNK_SIZE + 1, pdf.length - 1]]) {
    const response = await publicCall(id(1), { headers: { Range: `bytes=${from}-${to}`, 'If-Range': initialHead.headers.get('etag') } })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-range'), `bytes ${from}-${to}/${pdf.length}`)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf.subarray(from, to + 1))
  }
  assert.deepEqual(Buffer.from(await (await publicCall(id(1), { headers: { Range: 'bytes=-17' } })).arrayBuffer()), pdf.subarray(-17))
  assert.equal((await publicCall(id(1), { headers: { Range: `bytes=${pdf.length}-` } })).status, 416)
  assert.equal((await publicCall(id(1), { headers: { Range: 'bytes=0-1,3-4' } })).status, 416)
  assert.deepEqual(Buffer.from(await (await publicCall(id(1), { headers: { Range: 'bytes=0-4', 'If-Range': '"changed"' } })).arrayBuffer()), pdf)
  unavailableHash = record.chunks[0].hash
  assert.equal((await publicCall(id(1))).status, 502)
  unavailableHash = undefined

  // Lifecycle safety runs before leasing, downloading, publishing or removing anything.
  lifecycleExpiry = true
  await assert.rejects(run, /Remove automatic object expiry/u)
  lifecycleExpiry = false

  const small = Buffer.from('%PDF-1.7\nsecond file\n%%EOF')
  await relay.put(id(2), small)
  uploadFailure = true
  await assert.rejects(run, /HTTP 503/u)
  assert.ok(await relay.head(id(2)))
  assert.ok(await relay.head(`archive-pending/${id(2)}.json`), 'staging survives a failed upload')
  uploadFailure = false
  deployFailure = true
  await assert.rejects(run, /HTTP 503/u)
  assert.ok(await relay.head(id(2)), 'failed deployment retains the original')
  deployFailure = false
  serveFailure = true
  await assert.rejects(run, /HTTP 404/u)
  serveFailure = false
  assert.ok(await relay.head(id(2)), 'failed post-deploy verification retains the original')
  assert.equal((await run()).archived, 1, 'next run recovers the staged transaction')
  assert.equal(await relay.head(id(2)), null)
  const oldDomain = await runtime.dispatchFetch(`https://ocr-files.any1.tech/${id(2)}`)
  assert.equal(await oldDomain.text(), small.toString(), 'previously issued R2 links survive migration')
  assert.deepEqual(Buffer.from(await (await publicCall(id(1))).arrayBuffer()), pdf, 'new deployments preserve older PDFs')

  const secretless = await runtime.dispatchFetch(`${baseUrl}/api/internal/pdf-archive/candidates?scope=library`)
  assert.equal(secretless.status, 401)
  const one = bridge(), two = bridge()
  await one.acquire()
  await assert.rejects(() => two.acquire(), /HTTP 409/u)
  await one.release()
  await two.acquire()
  await two.release()

  await bucket.put(id(3), Buffer.from('%PDF-corrupt-test'))
  // Discover and stage then make the published bytes corrupt without changing their lengths.
  const malicious = publisher()
  const originalPublish = malicious.publish
  malicious.publish = async (...args) => { await originalPublish(...args); corruptHash = [...assets.keys()].find(k => !record.chunks.some(c => k === assetPath(c.hash)) && k !== assetPath(digest(small).slice(0, 32)))?.split('/').pop().replace('.bin', '') }
  await assert.rejects(() => archiveFiles({ bridge: bridge(), publisher: malicious, cache: cache(), log() {} }), /verification failed/u)
  assert.ok(await bucket.head(id(3)))
  corruptHash = undefined
  await run()

  await bucket.put(id(7), Buffer.from('%PDF-assembled-verification'))
  const brokenAssembly = bridge()
  brokenAssembly.verify = async () => { throw new Error('simulated assembled download failure') }
  await assert.rejects(() => archiveFiles({ bridge: brokenAssembly, publisher: publisher(), cache: cache(), log() {} }), /assembled download failure/u)
  assert.ok(await bucket.head(id(7)), 'individual chunk hashes do not authorize deletion until full cold download passes')
  await run()

  // A process killed during commit leaves some pointers committed and some originals hot.
  await bucket.put(id(4), Buffer.from('%PDF-commit-one'))
  await bucket.put(id(5), Buffer.from('%PDF-commit-two'))
  const interrupted = bridge()
  const commit = interrupted.commit
  let committed = 0
  interrupted.commit = async record => {
    await commit(record)
    if (++committed === 1) throw new Error('simulated process death after first commit')
  }
  await assert.rejects(() => archiveFiles({ bridge: interrupted, publisher: publisher(), cache: cache(), log() {} }), /process death/u)
  assert.equal(await bucket.head(id(4)), null)
  assert.ok(await bucket.head(id(5)))
  assert.equal(await (await publicCall(id(4))).text(), '%PDF-commit-one')
  assert.equal((await run()).archived, 1)
  assert.equal(await (await publicCall(id(5))).text(), '%PDF-commit-two')

  // Files younger than a day never become candidates.
  await bucket.put(id(6), Buffer.from('%PDF-not-old-enough'))
  await runtime.dispatchFetch(`${baseUrl}/__test/clock?delta=0`)
  assert.equal((await run()).archived, 0)
  assert.ok(await bucket.head(id(6)))
  await runtime.dispatchFetch(`${baseUrl}/__test/clock?delta=${25 * 60 * 60 * 1000}`)
  assert.equal((await run()).archived, 1)

  assert.equal((await privateCall(id(1), 'DELETE')).status, 204)
  assert.equal((await publicCall(id(1))).status, 410)
  assert.equal((await privateCall(id(1))).status, 410)
  assert.equal((await privateCall(id(1), 'DELETE')).status, 204)
  assert.ok(lifecycleChecks >= 2 && deployments >= 2 && archiveReads > 0)
  console.log('archive-worker: real workerd/R2 + production runner transaction passed: >25 MiB PDF, hashes, cross-part/suffix/If-Range/HEAD, owner isolation, legacy URLs, leases, 24-hour eligibility, interrupted commits, staged recovery, upload/deploy/verification failure safety and deletion')
} finally { await runtime.dispose() }
