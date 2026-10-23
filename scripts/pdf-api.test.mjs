import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const { DEFAULT_PDF_SYSTEM_PROMPT, cancelPdfJob, createPdfJob, getPdfConversionConfig, listPdfJobs, pdfDownloadUrl, rerunPdfJob, savePdfConversionConfig } = await server.ssrLoadModule('/src/lib/api/file-conversion.ts')
  setSession({ token: 'test', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  let sent
  const config = {
    id: 'cfg-1', owner: 'owner-1', conversionType: 'pdf_to_md', name: '默认配置', revision: 2,
    systemPrompt: '系统提示词-1',
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
  await assert.rejects(() => savePdfConversionConfig(loaded, { ...loaded.options, provider: 'modelflare', model: 'gemini-3.5-flash-lite' }, loaded.systemPrompt), /模型/u)
  const modelflare = await savePdfConversionConfig(loaded, { ...loaded.options, provider: 'modelflare', model: 'gpt-6-sol', reasoning_effort: 'high', max_output_tokens: 32000 }, loaded.systemPrompt)
  assert.equal(modelflare.options.provider, 'modelflare')
  assert.equal(loaded.systemPrompt, '系统提示词-1')
  await assert.rejects(() => savePdfConversionConfig(loaded, { ...loaded.options, concurrency: 101 }, loaded.systemPrompt), /数值格式无效/u)
  await assert.rejects(() => savePdfConversionConfig(loaded, loaded.options, 'x'.repeat(12001)), /系统提示词不能超过/u)
  const saved = await savePdfConversionConfig(loaded, { ...loaded.options, concurrency: 60 }, '  系统提示词-2  ')
  assert.equal(saved.revision, 3)
  assert.equal(saved.systemPrompt, '系统提示词-2')
  assert.equal(sent.body.options.concurrency, 60)
  assert.equal(sent.body.systemPrompt, '系统提示词-2')
  await createPdfJob('job1', { title: 'Book', sourceUrl: 'https://example.com/book.pdf', outputName: 'Book', prompt: '', configId: 'cfg-1', startPage: 3, endPage: 4 })
  assert.equal(sent.body.owner, 'owner-1')
  assert.equal(sent.body.id, 'job1')
  assert.equal(sent.body.configId, 'cfg-1')
  assert.equal(sent.body.startPage, 3)
  assert.equal(sent.body.endPage, 4)
  assert.equal('options' in sent.body, false)
  await createPdfJob('job2', { title: '讲义', sourceUrl: 'https://example.com/book.pdf', outputName: '  ', prompt: '', configId: 'cfg-1' })
  assert.equal(sent.body.outputName, '')
  await cancelPdfJob({ id: 'job1', owner: 'owner-1', status: 'running' })
  assert.equal(sent.url.pathname.endsWith('/aw_pdf_to_md_jobs/records/job1'), true)
  assert.deepEqual(sent.body, { cancelRequested: true })
  await rerunPdfJob('rerun1', { id: 'job1', owner: 'owner-1', status: 'failed' })
  assert.deepEqual(sent.body, { id: 'rerun1', owner: 'owner-1', rerunOf: 'job1' })
  await assert.rejects(() => rerunPdfJob('rerun2', { id: 'job1', owner: 'owner-1', status: 'running' }), /结束/u)
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
  // Pin the visible default to the same seed as PocketBase and the converter.
  assert.equal(createHash('sha256').update(DEFAULT_PDF_SYSTEM_PROMPT).digest('hex'), '53e12c289f49f3c44b513e9b48c7604f6694af3cf5c4f93190cfb9898a51615f')
  for (const systemPrompt of [undefined, null, '', '  \n ']) {
    let patches = 0
    globalThis.fetch = async (input, init) => {
      if (init?.method === 'PATCH') {
        patches++
        const body = JSON.parse(init.body)
        assert.equal(body.systemPrompt, DEFAULT_PDF_SYSTEM_PROMPT)
        return Response.json({ ...config, ...body, revision: 3 })
      }
      return Response.json({ items: [{ ...config, systemPrompt }] })
    }
    assert.equal((await getPdfConversionConfig()).systemPrompt, DEFAULT_PDF_SYSTEM_PROMPT)
    assert.equal(patches, 1, 'persist the visible default before allowing a task')
  }
  let concurrentPatches = 0
  let releaseInitialization
  const initializationGate = new Promise(resolve => { releaseInitialization = resolve })
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PATCH') {
      concurrentPatches++
      await initializationGate
      return Response.json({ ...config, systemPrompt: DEFAULT_PDF_SYSTEM_PROMPT, revision: 3 })
    }
    return Response.json({ items: [{ ...config, systemPrompt: '' }] })
  }
  const initializations = [getPdfConversionConfig(), getPdfConversionConfig()]
  await new Promise(resolve => setTimeout(resolve, 20))
  releaseInitialization()
  await Promise.all(initializations)
  assert.equal(concurrentPatches, 1, 'concurrent mounts initialize the profile once')
  globalThis.fetch = async (_input, init) => {
    assert.notEqual(init?.method, 'PATCH', 'custom prompts must not be overwritten')
    return Response.json({ items: [config] })
  }
  assert.equal((await getPdfConversionConfig()).systemPrompt, config.systemPrompt)
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PATCH') return Response.json({ ...config, ...JSON.parse(init.body), revision: 3 })
    throw Error('Unexpected request')
  }
  assert.equal((await savePdfConversionConfig(loaded, loaded.options, '')).systemPrompt, DEFAULT_PDF_SYSTEM_PROMPT)
  // Do not show a successful save if an old backend drops the prompt field.
  globalThis.fetch = async (_input, init) => init?.method === 'PATCH'
    ? Response.json({ ...config, systemPrompt: '' })
    : Response.json({ items: [{ ...config, systemPrompt: '' }] })
  await assert.rejects(() => getPdfConversionConfig(), /后端未保存提示词/u)
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body)
      assert.equal(body.systemPrompt, DEFAULT_PDF_SYSTEM_PROMPT)
      return Response.json({ ...body, revision: 1 })
    }
    return Response.json({ items: [] })
  }
  assert.equal((await getPdfConversionConfig()).systemPrompt, DEFAULT_PDF_SYSTEM_PROMPT)
  console.log('pdf-api: ownership, create identity and protected download passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
