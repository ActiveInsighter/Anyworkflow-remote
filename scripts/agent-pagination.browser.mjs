import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({
  token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid',
})))
const page = await context.newPage()
page.setDefaultTimeout(15000)
const errors = [], requests = []
page.on('pageerror', error => errors.push(error.message))
let total = 120, failCursor = null, outage = false
const job = { id: 'aaaaaaaaaaaaaaa', owner: 'owner-1', title: 'Long Agent progress', model: 'Antigravity', prompt: 'Read all saved steps',
  status: 'running', sources: [], history: [], threadRoot: 'aaaaaaaaaaaaaaa', totalChunks: 1, options: {}, created: new Date().toISOString(), updated: new Date().toISOString() }
const message = () => ({ id: 'bbbbbbbbbbbbbbb', owner: job.owner, job: job.id, index: 1, part: 1,
  status: 'running', inputText: '', reply: '', usage: {}, streamRevision: total, progressAt: new Date().toISOString() })
const listing = items => ({ page: 1, perPage: 100, totalItems: items.length, totalPages: 1, items })
await context.route('https://pb.example.invalid/**', async route => {
  const url = new URL(route.request().url())
  if (url.pathname.endsWith('/parts')) {
    const cursor = Number(url.searchParams.get('after'))
    requests.push(cursor)
    // Real mobile RTT is often longer than the old 100ms pagination timer.
    // The second page also exceeds the regular 3s poll interval: the shared
    // async hook must not abort a multi-page load that is still progressing.
    await new Promise(resolve => setTimeout(resolve, cursor === 100 ? 3800 : 450))
    if (outage || cursor === failCursor) {
      failCursor = null
      return route.fulfill({ status: 503, json: { message: '进度读取暂时失败' } })
    }
    const end = Math.min(total, cursor + 100)
    const items = Array.from({ length: Math.max(0, end - cursor) }, (_, index) => {
      const revision = cursor + index + 1
      return { id: `part-${revision}`, key: `step:${revision - 1}`, owner: job.owner, message: message().id,
        sequence: revision, revision, type: 'text', status: 'completed', content: `Saved step ${revision}`,
        updated: new Date(Date.now() - (revision <= 100 ? 23 * 60_000 : 0)).toISOString() }
    })
    return route.fulfill({ json: { items, nextCursor: end, hasMore: end < total, revision: total,
      status: 'running', progressAt: new Date().toISOString(), usage: {} } })
  }
  if (url.pathname.endsWith('/messages/bbbbbbbbbbbbbbb')) return route.fulfill({ json: message() })
  if (url.pathname.endsWith('/gemini/jobs/aaaaaaaaaaaaaaa')) return route.fulfill({ json: { job, messages: [message()] } })
  if (url.pathname.includes('/aw_gemini_jobs/records')) return route.fulfill({ json: listing([job]) })
  if (url.pathname.endsWith('/gemini/config')) return route.fulfill({ json: { owner: job.owner, revision: 0,
    config: { model: 'Antigravity', systemPrompt: '', delimiter: '<!-- aw:split -->', concurrency: 1 } } })
  if (url.pathname.endsWith('/models/catalog')) return route.fulfill({ json: { provider: 'gemini', status: 'ready', models: [] } })
  if (url.pathname.endsWith('/models/saved')) return route.fulfill({ json: [] })
  return route.fulfill({ json: listing([]) })
})
try {
  await page.goto(`${process.env.TEST_BASE_URL}/gemini?job=${job.id}`)
  await page.getByText('Saved step 120', { exact: true }).waitFor()
  assert.ok(requests.includes(100), 'initial history must drain the second page')
  assert.ok(!(await page.getByTestId('gemini-execution-status').innerText()).includes('23 分钟前'))
  // A failed second page must not partially mutate the committed cursor/map.
  const before = requests.length
  total = 350; failCursor = 220
  await page.getByText('进度读取暂时失败', { exact: true }).waitFor()
  assert.equal(await page.getByText('Saved step 120', { exact: true }).count(), 1)
  assert.equal(await page.getByText('Saved step 220', { exact: true }).count(), 0)
  await page.getByText('Saved step 350', { exact: true }).waitFor()
  assert.ok(requests.slice(before).filter(cursor => cursor === 120).length >= 2, 'failed drain must retry from its committed cursor')
  outage = true
  await page.getByText('进度读取暂时失败', { exact: true }).waitFor()
  assert.equal(await page.getByText('Saved step 350', { exact: true }).count(), 1, 'polling errors retain all known steps')
  outage = false
  await page.reload()
  await page.getByText('Saved step 350', { exact: true }).waitFor()
  for (const width of [320, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`)
  }
  assert.deepEqual(errors, [])
  console.log('agent-pagination: slow multi-page reads, atomic cursor commits, retries, retained history, reload and responsive layouts passed')
} finally { await browser.close() }
