import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const api = await server.ssrLoadModule('/src/lib/api/page-capture.ts')
  const display = await server.ssrLoadModule('/src/features/page-capture/lib/capture-display.ts')
  const { pageCaptureKind } = await server.ssrLoadModule('/src/lib/tasks/index.ts')
  const { taskStatusMeta } = await server.ssrLoadModule('/src/lib/tasks/status.ts')
  setSession({ token: 'fixture-token', record: { id: 'owner' }, baseUrl: 'https://pb.example.invalid' })

  // Pasted input: any whitespace separates, a bare host works, duplicates collapse.
  assert.deepEqual(api.parseCaptureUrls('https://a.dev/1\n  https://a.dev/1 example.com/x\tftp://b.dev/ javascript:alert(1)'), {
    urls: ['https://a.dev/1', 'https://example.com/x'],
    invalid: ['ftp://b.dev/', 'javascript:alert(1)'],
  })
  assert.deepEqual(api.parseCaptureUrls('   '), { urls: [], invalid: [] })
  assert.deepEqual(api.parseCaptureUrls(`https://a.dev/${'x'.repeat(3000)}`).urls, [])

  // Only what the user set reaches the record.
  assert.deepEqual(api.compactCaptureOptions({ waitFor: ' ', contentSelector: ' main ', removeSelectors: ['', ' .ad '], scroll: false, keepHtml: true, timeoutSeconds: undefined }), {
    contentSelector: 'main', removeSelectors: ['.ad'], keepHtml: true,
  })

  // Lifecycle reads through the shared kind, not raw status strings.
  assert.equal(api.isCaptureJobActive({ id: 'a', status: 'extracting' }), true)
  assert.equal(api.isCaptureJobFinished({ id: 'a', status: 'partial' }), true)
  assert.equal(api.hasCaptureResult({ status: 'partial' }), true)
  assert.equal(api.hasCaptureResult({ status: 'failed' }), false)
  assert.equal(taskStatusMeta(pageCaptureKind, { id: 'a', status: 'rendering' }).label, '等待渲染')
  assert.equal(taskStatusMeta(pageCaptureKind, { id: 'a', status: 'queued' }).label, '等待扩展')
  assert.equal(taskStatusMeta(pageCaptureKind, { id: 'a', status: 'rendering', cancelRequested: true }).label, '结束中')

  const now = Date.parse('2026-11-05T12:00:00Z')
  assert.equal(api.isCaptureWorkerOnline({ lastSeenAt: '2026-11-05 11:59:00.000Z' }, now), true)
  assert.equal(api.isCaptureWorkerOnline({ lastSeenAt: '2026-11-05 11:57:00.000Z' }, now), false)
  assert.equal(api.isCaptureWorkerOnline({ lastSeenAt: '' }, now), false)

  // Writes: exact payloads and routes.
  const job = { id: 'capture00000001', owner: 'owner', url: 'https://a.dev/1', status: 'failed', options: { scroll: true } }
  const calls = []
  let respond = () => Response.json(job)
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(input), init })
    return respond(new URL(input), init)
  }
  await api.createCaptureJob('capture00000002', 'https://a.dev/1', { scroll: true, waitFor: '' })
  assert.equal(calls.at(-1).url.pathname, '/api/collections/aw_capture_jobs/records')
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { owner: 'owner', url: 'https://a.dev/1', options: { scroll: true }, id: 'capture00000002' })

  await api.rerunCaptureJob('capture00000003', job)
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { owner: 'owner', url: 'https://a.dev/1', options: { scroll: true }, rerunOf: job.id, id: 'capture00000003' })
  assert.throws(() => api.rerunCaptureJob('capture00000004', { ...job, status: 'opening' }), /还没有结束/u)

  await api.cancelCaptureJob({ ...job, status: 'opening' })
  assert.equal(calls.at(-1).url.pathname, `/api/anyworkflow/capture/jobs/${job.id}/cancel`)
  assert.equal(calls.at(-1).init.method, 'POST')
  await assert.rejects(api.cancelCaptureJob(job), /已经结束/u)

  respond = () => new Response(null, { status: 204 })
  await api.deleteCaptureJob(job)
  assert.equal(calls.at(-1).init.method, 'DELETE')
  await assert.rejects(api.deleteCaptureJob({ ...job, status: 'queued' }), /还没有结束/u)

  // A lost create response resolves to the saved record, not a second job.
  let posts = 0
  respond = (_url, init) => {
    if (init.method === 'POST') {
      posts += 1
      return Response.json({ message: 'The record id is not unique.' }, { status: 400 })
    }
    return Response.json(job)
  }
  assert.equal((await api.createCaptureJob(job.id, job.url, {})).id, job.id)
  assert.equal(posts, 1)

  // The record belongs to someone else: nothing is trusted from it.
  respond = () => Response.json({ ...job, owner: 'stranger' })
  await assert.rejects(api.createCaptureJob('capture00000005', job.url, {}), /归属/u)

  // Results load by job, owner-scoped, and a missing one is an error.
  respond = () => Response.json({ items: [{ id: 'r', owner: 'owner', job: job.id, markdown: '# hi' }], page: 1, perPage: 1, totalItems: 1, totalPages: 1 })
  assert.equal((await api.getCaptureResult(job.id)).markdown, '# hi')
  assert.equal(calls.at(-1).url.searchParams.get('filter'), `owner="owner" && job="${job.id}"`)
  respond = () => Response.json({ items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 })
  await assert.rejects(api.getCaptureResult(job.id), /不存在/u)

  // Display helpers carry untrusted values.
  assert.equal(display.safeHref('javascript:alert(1)'), undefined)
  assert.equal(display.safeHref('data:text/html,x'), undefined)
  assert.equal(display.safeHref('not a url'), undefined)
  assert.equal(display.safeHref('https://a.dev/x'), 'https://a.dev/x')
  assert.equal(display.extractorLabel('site:zhihu'), '站点规则 · zhihu')
  assert.equal(display.extractorLabel('defuddle'), '通用解析')
  assert.equal(display.extractorLabel('defuddle:site'), '通用解析 · 站点适配')
  assert.equal(display.extractorLabel('readability'), '通用解析（备用）')
  assert.equal(display.warningLabel('truncated'), '内容过长，已截断')
  assert.equal(display.warningLabel('new_code'), 'new_code')
  assert.equal(display.captureFilename(' ../CON:标题 '), '_CON_标题.md')
  assert.equal(display.captureFilename(''), '网页采集.md')
  assert.equal(display.markdownPreview('字'.repeat(display.PREVIEW_CHARS + 1)).clipped, true)
  assert.equal(display.markdownPreview('字').clipped, false)

  const saved = display.captureDocument({ title: 'A "quoted" title', url: 'https://a.dev/1', canonicalUrl: '', byline: '', siteName: 's', publishedAt: '', created: '2026-11-05', markdown: '# hi' })
  assert.equal(saved, '---\ntitle: "A \\"quoted\\" title"\nsource: "https://a.dev/1"\nsite: "s"\ncaptured: "2026-11-05"\n---\n\n# hi\n')
  console.log('page capture API checks passed')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
