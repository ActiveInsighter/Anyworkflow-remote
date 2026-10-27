import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const now = new Date().toISOString()
const base = { owner: 'owner-1', created: now, updated: now }
const run = { ...base, id: 'run-1', title: '研究结果与对话导出', planText: '@task Test {}', familyId: 'run-1', status: 'succeeded', origin: 'initial', requestedAction: 'none', completedTasks: 1, totalTasks: 1, versionMajor: 1, versionMinor: 0, executionMode: 'serial', scheduledAt: '' }
let jobs = []
let submissions = 0
let failList = false
const requests = []
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1', email: 'test@example.invalid' }, baseUrl: 'https://pb.example.invalid' })))
await context.route('https://pb.example.invalid/**', async route => {
  const req = route.request()
  const url = new URL(req.url())
  // The task center's feed (all kinds, no Run filter) is not this sheet's export list.
  if (url.searchParams.get('skipTotal')) return route.fulfill({ json: { page: 1, perPage: 8, totalItems: -1, totalPages: -1, items: [] } })
  requests.push(url)
  if (url.pathname === '/api/files/token') return route.fulfill({ json: { token: 'file-token' } })
  if (url.pathname.startsWith('/api/files/aw_run_exports/')) {
    assert.equal(url.searchParams.get('token'), 'file-token')
    return route.fulfill({ contentType: 'application/zip', body: Buffer.from('PKtest') })
  }
  const collection = url.pathname.split('/')[3]
  const id = url.pathname.split('/')[5]
  let items = []
  if (collection === 'aw_dispatch_runs') items = [run]
  if (collection === 'aw_run_exports') {
    if (req.method() === 'POST') {
      submissions++
      const body = req.postDataJSON()
      assert.equal(body.run, run.id)
      const job = { ...base, ...body, title: run.title, status: 'queued', progress: 0, messageCount: 0, documentCount: 0, file: '', fileSize: 0, warnings: [], error: '', snapshotAt: '', expiresAt: '' }
      jobs.unshift(job)
      return route.fulfill({ json: job })
    }
    if (failList) return route.fulfill({ status: 500, json: { message: '测试连接中断' } })
    assert.ok(url.searchParams.get('filter').includes('run="run-1"'))
    items = jobs
  }
  const perPage = Number(url.searchParams.get('perPage') || 20)
  const currentPage = Number(url.searchParams.get('page') || 1)
  return route.fulfill({ json: id ? items.find(row => row.id === id) : { page: currentPage, perPage, totalItems: items.length, totalPages: Math.ceil(items.length / perPage), items: items.slice((currentPage - 1) * perPage, currentPage * perPage) } })
})
async function openExport() {
  await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出 AI 对话', exact: true }).click()
  await page.getByRole('dialog', { name: '导出 AI 对话' }).waitFor()
}
try {
  await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'}/runs/run-1`)
  assert.equal(requests.some(url => url.pathname.includes('aw_run_exports')), false, 'exports are loaded only on demand')
  await openExport()
  await page.getByText('暂无导出记录', { exact: true }).waitFor()
  await page.getByRole('combobox', { name: '导出内容' }).selectOption('assistant')
  await page.getByRole('button', { name: '生成 ZIP', exact: true }).click()
  await page.getByRole('button', { name: '正在导出，请稍候' }).waitFor()
  assert.equal(submissions, 1)
  assert.equal(jobs[0].contentMode, 'assistant')
  await page.keyboard.press('Escape')
  jobs[0] = { ...jobs[0], status: 'packaging', progress: 75 }
  await openExport()
  await page.getByText('打包中', { exact: true }).waitFor()
  jobs[0] = { ...jobs[0], status: 'succeeded', progress: 100, messageCount: 12, documentCount: 3, file: '中文对话.zip', fileSize: 6, expiresAt: new Date(Date.now() + 86400_000).toISOString(), warnings: ['部分对话尚未同步'] }
  await page.getByRole('button', { name: '刷新导出记录' }).click()
  await page.getByRole('button', { name: '下载 ZIP', exact: true }).waitFor()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 ZIP', exact: true }).click()
  assert.equal((await downloaded).suggestedFilename(), `${run.title}.zip`)
  await page.getByText('包含 1 条导出说明，请查看 ZIP 中的 README.md。').waitFor()
  if (process.env.SCREENSHOT_DIR) await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow ${width}`)
      const dialog = page.getByRole('dialog')
      assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `dialog overflow ${width}`)
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/run-export-${scheme}-${width}.png`, fullPage: true })
    }
  }
  jobs[0] = { ...jobs[0], status: 'expired', file: '', fileSize: 0 }
  await page.getByRole('button', { name: '刷新导出记录' }).click()
  await page.getByText('已过期', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '下载 ZIP', exact: true }).count(), 0)
  failList = true
  await page.getByRole('button', { name: '刷新导出记录' }).click()
  await page.getByText('测试连接中断', { exact: true }).waitFor()
  failList = false
  await page.getByRole('button', { name: '刷新导出记录' }).click()
  await page.getByRole('button', { name: '生成 ZIP', exact: true }).waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('button', { name: '更多操作', exact: true }).evaluate(element => element === document.activeElement), true)
  assert.deepEqual(errors, [])
  console.log('PASS: Run export create/progress/reopen/download/expiry/errors/focus and light/dark 320/390/760/1440px')
} finally { await browser.close() }
