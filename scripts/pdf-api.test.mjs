import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
  const { createPdfJob, getPdfConversionConfig, listPdfJobs, pdfDownloadUrl, savePdfConversionConfig } = await server.ssrLoadModule('/src/lib/file-conversion.ts')
  setSession({ token: 'test', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  let sent
  const config = {
    id: 'cfg-1', owner: 'owner-1', conversionType: 'pdf_to_md', name: '默认配置', revision: 2,
    options: { concurrency: 5, model: 'gemini-3.5-flash-lite' },
  }
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    sent = { url, body: init?.body ? JSON.parse(init.body) : null }
    if (url.pathname.endsWith('/aw_file_conversion_configs/records') && init?.method === 'GET') {
      return Response.json({ items: [config], totalItems: 1, totalPages: 1, page: 1, perPage: 20 })
    }
    if (url.pathname.endsWith('/aw_file_conversion_configs/records/cfg-1') && init?.method === 'PATCH') {
      return Response.json({ ...config, ...sent.body, revision: 3 })
    }
    return Response.json({ id: 'job1', owner: 'owner-1', configId: 'cfg-1' })
  }
  const loaded = await getPdfConversionConfig()
  assert.equal(loaded.id, 'cfg-1')
  assert.equal(loaded.options.concurrency, 5)
  await assert.rejects(() => savePdfConversionConfig(loaded, { ...loaded.options, concurrency: 101 }), /数值格式无效/u)
  const saved = await savePdfConversionConfig(loaded, { ...loaded.options, concurrency: 60 })
  assert.equal(saved.revision, 3)
  assert.equal(sent.body.options.concurrency, 60)
  await createPdfJob('job1', { title: 'Book', sourceUrl: 'https://example.com/book.pdf', outputName: 'Book', prompt: '', configId: 'cfg-1', startPage: 3, endPage: 4 })
  assert.equal(sent.body.owner, 'owner-1')
  assert.equal(sent.body.id, 'job1')
  assert.equal(sent.body.configId, 'cfg-1')
  assert.equal(sent.body.startPage, 3)
  assert.equal(sent.body.endPage, 4)
  assert.equal('options' in sent.body, false)
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/aw_pdf_to_md_jobs/records') && init?.method === 'POST') {
      return Response.json({ message: 'temporary failure' }, { status: 500 })
    }
    return Response.json({
      id: 'job1', owner: 'owner-1', title: 'Book', sourceUrl: 'https://example.com/book.pdf',
      outputName: 'different-output', configId: 'cfg-1',
    })
  }
  await assert.rejects(
    () => createPdfJob('job1', { title: 'Book', sourceUrl: 'https://example.com/book.pdf', outputName: 'Book', prompt: '', configId: 'cfg-1' }),
    /temporary failure/,
  )
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
  globalThis.fetch = async () => Response.json({ items: [{ ...config, options: { ...config.options, dpi: 500 } }] })
  await assert.rejects(() => getPdfConversionConfig(), /格式无效/)
  console.log('pdf-api: ownership, create identity and protected download passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
