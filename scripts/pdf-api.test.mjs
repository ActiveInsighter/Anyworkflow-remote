import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
  const { createPdfJob, listPdfJobs, pdfDownloadUrl } = await server.ssrLoadModule('/src/lib/pdf.ts')
  setSession({ token: 'test', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  let sent
  globalThis.fetch = async (input, init) => {
    sent = { url: new URL(input), body: init.body ? JSON.parse(init.body) : null }
    return Response.json({ id: 'job1', owner: 'owner-1' })
  }
  await createPdfJob('job1', { title: 'Book', sourceUrl: 'https://example.com/book.pdf', outputName: 'Book', prompt: '', options: {} })
  assert.equal(sent.body.owner, 'owner-1')
  assert.equal(sent.body.id, 'job1')
  globalThis.fetch = async input => {
    sent.url = new URL(input)
    return Response.json({ items: [{ id: 'job1', owner: 'other' }] })
  }
  await assert.rejects(() => listPdfJobs(1), /归属/)
  assert.ok(sent.url.searchParams.get('filter').includes('owner="owner-1"'))
  globalThis.fetch = async () => Response.json({ token: 'short-lived' })
  const link = await pdfDownloadUrl({ id: 'job1', owner: 'owner-1', file: 'book.zip' })
  assert.equal(new URL(link).searchParams.get('token'), 'short-lived')
  assert.equal(new URL(link).searchParams.get('download'), '1')
  console.log('pdf-api: ownership, create identity and protected download passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
