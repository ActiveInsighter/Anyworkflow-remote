import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer, request as proxyRequest } from 'node:http'

const target = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const job = { id: 'aaaaaaaaaaaaaaa', owner: 'owner-1', title: '考研真相英语真题详解', outputName: '考研真相英语真题详解', sourceUrl: 'https://example.invalid/book.pdf', file: 'random.zip', fileSize: 32116376, status: 'succeeded', created: new Date().toISOString(), options: {} }
let release, tokenCalls = 0
let notifyRequested
const requested = new Promise(resolve => { notifyRequested = resolve })
const hold = new Promise(resolve => { release = resolve })
// Chromium's native download loader bypasses Playwright's mocked routes. Use a real,
// gated HTTP response at the page origin to prove headers arrive before the full ZIP.
const local = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname === '/api/file-conversion/download') {
    assert.equal(url.searchParams.get('job'), job.id)
    assert.equal(url.searchParams.get('file'), job.file)
    assert.equal(url.searchParams.get('token'), 'short-lived')
    assert.equal(url.searchParams.get('name'), `${job.outputName}.zip`)
    response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': '8', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(`${job.outputName}.zip`) })
    response.write(Buffer.from([80, 75, 3, 4]))
    notifyRequested()
    await hold
    response.end(Buffer.from([1, 2, 3, 4]))
    return
  }
  const forwarded = proxyRequest(new URL(request.url, target), { method: request.method, headers: { ...request.headers, host: new URL(target).host } }, upstream => {
    response.writeHead(upstream.statusCode, upstream.headers)
    upstream.pipe(response)
  })
  forwarded.on('error', () => { response.writeHead(502); response.end() })
  request.pipe(forwarded)
})
await new Promise(resolve => local.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${local.address().port}`
const errors = []
const requestedPaths = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => requestedPaths.push(new URL(request.url()).pathname))
await context.addInitScript(() => {
  localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'client', record: { id: 'owner-1' }, baseUrl: 'https://pb.any1.tech' }))
  const original = window.fetch
  window.fetch = (input, init) => {
    const url = String(input)
    if (url.includes('/api/file-conversion/download?') || /\/api\/files\/aw_pdf_to_md_jobs\//u.test(url)) throw new Error('ZIP must use browser download, never page fetch')
    return original(input, init)
  }
})
await context.route('https://pb.any1.tech/**', route => {
  const url = new URL(route.request().url())
  if (url.pathname === '/api/files/token') { tokenCalls++; return route.fulfill({ json: { token: 'short-lived' } }) }
  const items = url.pathname.includes('aw_file_conversion_configs')
    ? [{ id: 'cfg', owner: 'owner-1', conversionType: 'pdf_to_md', revision: 1, systemPrompt: 'keep text', options: {} }]
    : [job]
  return route.fulfill({ json: { items, totalItems: 1, totalPages: 1, page: 1, perPage: 20 } })
})
try {
  await page.goto(origin + '/file-converter')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 ZIP', exact: true }).click({ noWaitAfter: true })
  await Promise.race([requested, new Promise((_, reject) => setTimeout(() => reject(new Error('Native download route was not requested')), 10_000))])
  const saved = await download
  await page.getByText('已交给浏览器下载，可在下载列表查看进度', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '下载 ZIP', exact: true }).isEnabled(), true)
  assert.equal(await page.getByRole('button', { name: '重跑', exact: true }).isEnabled(), true, 'large downloads do not lock the task actions')
  assert.equal(tokenCalls, 1)
  release()
  assert.equal(saved.suggestedFilename(), `${job.outputName}.zip`)
  assert.equal(await saved.failure(), null)
  for (const width of [320, 390, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  assert.deepEqual(errors, [])
  console.log('PDF download browser: native handoff before transfer completes, unlocked actions, authenticated URL and Chinese filename passed')
} catch (error) {
  console.error(JSON.stringify({ alerts: await page.getByRole('alert').allTextContents(), tokenCalls, requestedPaths: requestedPaths.filter(path => path.startsWith('/api/')), errors }))
  throw error
} finally { release(); await browser.close(); local.closeAllConnections(); await new Promise(resolve => local.close(resolve)) }
