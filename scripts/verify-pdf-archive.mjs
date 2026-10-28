import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { archiveFiles, createBridge, createPublisher, CHUNK_SIZE } from './archive-files.mjs'

/** A public, synthetic one-page PDF. The unused stream forces a real multi-asset archive. */
export function verificationPdf() {
  const payload = randomBytes(CHUNK_SIZE + 2 * 1024 * 1024)
  const text = 'BT /F1 20 Tf 72 720 Td (AnyWorkflow archive verification) Tj 0 -40 Td (This PDF was restored from Worker Assets.) Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    Buffer.concat([Buffer.from(`<< /Type /EmbeddedFile /Length ${payload.length} >>\nstream\n`), payload, Buffer.from('\nendstream')]),
  ]
  const parts = [Buffer.from('%PDF-1.7\n')], offsets = []
  let size = parts[0].length
  for (const [index, object] of objects.entries()) {
    offsets.push(size)
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(object), Buffer.from('\nendobj\n')])
    parts.push(part); size += part.length
  }
  parts.push(Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`))
  return Buffer.concat(parts)
}

export async function main() {
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken, ARCHIVE_ADMIN_SECRET: secret, PDF_ARCHIVE_GATEWAY: baseUrl } = process.env
  if (!accountId || !apiToken || !secret || !baseUrl) throw new Error('Archive verification credentials are missing')
  const publisher = createPublisher({ accountId, apiToken })
  await publisher.checkLifecycles()
  const pdf = verificationPdf()
  const key = `${randomUUID()}.pdf`
  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const sourceUrl = `https://ocr-files.any1.tech/${key}`
  const objectUrl = name => `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/anyworkflow-ocr-relay/objects/${name}`
  const storage = async (name, body, contentType) => {
    const response = await fetch(objectUrl(name), { method: 'PUT', headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': contentType, 'Cache-Control': 'no-store' }, body, redirect: 'error', signal: AbortSignal.timeout(120_000) })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`Upload verification fixture: HTTP ${response.status}`)
  }
  await storage(key, pdf, 'application/pdf')
  const hot = await fetch(sourceUrl, { method: 'HEAD', signal: AbortSignal.timeout(30_000) })
  assert.equal(hot.status, 200, 'gateway must serve the hot fixture before migration')
  assert.equal(Number(hot.headers.get('content-length')), pdf.length)
  const httpEtag = hot.headers.get('etag')
  assert.ok(/^"[a-f0-9]+"$/u.test(httpEtag), 'single-object R2 identity must be available')
  const record = { v: 1, scope: 'relay', key, size: pdf.length, etag: httpEtag.slice(1, -1), httpEtag, uploaded: new Date().toISOString(), customMetadata: {}, chunks: [] }
  for (let offset = 0; offset < pdf.length; offset += CHUNK_SIZE) {
    const content = pdf.subarray(offset, offset + CHUNK_SIZE)
    const sha256 = createHash('sha256').update(content).digest('hex')
    record.chunks.push({ hash: sha256.slice(0, 32), sha256, size: content.length })
  }
  const bridge = createBridge({ baseUrl, secret })
  const lease = await bridge.acquire()
  const directory = await mkdtemp(new URL('../.archive-work-verification-', import.meta.url))
  let released = false
  const release = bridge.release
  bridge.release = async () => { await release(); released = true }
  try {
    // Operator-only rehearsal: seed an index for this freshly created synthetic PDF via R2 admin API.
    // Production eligibility and stage age checks remain unchanged; no user's PDF bypasses 24 hours.
    await storage(`archive-pending/${key}.json`, JSON.stringify(record), 'application/json')
    bridge.acquire = async () => lease
    bridge.candidates = async function* (scope) { if (scope === 'relay') yield record }
    const cache = {
      put: (hash, bytes) => writeFile(path.join(directory, hash), bytes),
      async get(hash) { try { return await readFile(path.join(directory, hash)) } catch (error) { if (error.code === 'ENOENT') return null; throw error } },
    }
    assert.equal((await archiveFiles({ bridge, publisher, cache })).archived, 1)
    const cold = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) })
    assert.equal(cold.status, 200)
    assert.equal(cold.headers.get('etag'), httpEtag)
    const reconstructed = Buffer.from(await cold.arrayBuffer())
    assert.equal(createHash('sha256').update(reconstructed).digest('hex'), sha256)
    assert.deepEqual(reconstructed, pdf)
    const from = CHUNK_SIZE - 13, to = CHUNK_SIZE + 19
    const ranged = await fetch(sourceUrl, { headers: { Range: `bytes=${from}-${to}`, 'If-Range': httpEtag }, signal: AbortSignal.timeout(120_000) })
    assert.equal(ranged.status, 206)
    assert.equal(ranged.headers.get('content-range'), `bytes ${from}-${to}/${pdf.length}`)
    assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), pdf.subarray(from, to + 1))
    const removed = await fetch(objectUrl(key), { headers: { Authorization: `Bearer ${apiToken}` }, signal: AbortSignal.timeout(30_000) })
    await removed.body?.cancel()
    assert.equal(removed.status, 404, 'R2 original must be absent after verified migration')
    const summary = { sourceUrl, bytes: pdf.length, chunks: record.chunks.length, sha256, crossChunkRange: 'passed', r2OriginalRemoved: true, verifiedAt: new Date().toISOString() }
    await mkdir('.deployment-evidence', { recursive: true })
    await writeFile('.deployment-evidence/pdf-archive-verification.json', JSON.stringify(summary, null, 2) + '\n')
    console.log(JSON.stringify(summary))
  } finally {
    if (!released) await bridge.release().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
