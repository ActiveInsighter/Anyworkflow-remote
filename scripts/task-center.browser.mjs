import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// Task center: one feed for Runs, conversions and exports; counts, links, completion toasts.
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const errors = []
const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const stamp = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString().replace('T', ' ')
const runBase = { owner: 'owner-1', planText: '@task T {}', familyId: 'run-a', origin: 'initial', requestedAction: 'none', versionMajor: 1, versionMinor: 0, executionMode: 'serial', scheduledAt: '', created: stamp(60) }
const rows = {
  aw_dispatch_runs: [
    { ...runBase, id: 'run-a', title: '计算机网络复习', status: 'running', totalTasks: 4, completedTasks: 1, updated: stamp(1) },
    { ...runBase, id: 'run-b', title: '每日英语阅读', status: 'succeeded', totalTasks: 2, completedTasks: 2, updated: stamp(90) },
  ],
  aw_pdf_to_md_jobs: [
    { id: 'job-a', owner: 'owner-1', title: '数学讲义', outputName: '数学笔记', status: 'running', cancelRequested: false, error: '', created: stamp(10), updated: stamp(2) },
  ],
  aw_run_exports: [
    { id: 'export-a', owner: 'owner-1', run: 'run-b', title: '每日英语阅读', contentMode: 'assistant', status: 'packaging', progress: 75, messageCount: 0, documentCount: 0, warnings: [], file: '', fileSize: 0, error: '', expiresAt: '', snapshotAt: '', created: stamp(3), updated: stamp(0) },
  ],
}
const feedRequests = []

async function open(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 't', record: { id: 'owner-1', email: 'test@example.invalid' }, baseUrl: 'https://pb.example.invalid' })))
  await context.route('https://pb.example.invalid/**', async (route) => {
    const url = new URL(route.request().url())
    assert.equal(route.request().method(), 'GET', 'following tasks never writes')
    const [, , , collection, , id] = url.pathname.split('/')
    const items = rows[collection] ?? []
    if (id) return route.fulfill({ json: items.find((row) => row.id === id) ?? rows.aw_dispatch_runs[0] })
    if (url.searchParams.get('skipTotal')) {
      feedRequests.push(collection)
      const filter = url.searchParams.get('filter')
      assert.match(filter, /^owner="owner-1" && \(\(/u, 'the feed is scoped to the owner')
      assert.doesNotMatch(filter, /status="draft"/u, 'drafts are not tasks')
    }
    return route.fulfill({ json: { page: 1, perPage: 20, totalItems: items.length, totalPages: 1, items } })
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  return { context, page }
}

try {
  // Desktop: popover, running counts in the sidebar, link into the export sheet.
  const desktop = await open(1440)
  let page = desktop.page
  await page.goto(`${baseUrl}/library`)
  const trigger = page.getByRole('button', { name: '任务中心，3 个进行中' })
  await trigger.waitFor()
  assert.deepEqual([...new Set(feedRequests)].sort(), ['aw_dispatch_runs', 'aw_pdf_to_md_jobs', 'aw_run_exports'])
  await page.getByLabel('1 个进行中').first().waitFor()
  await trigger.click()
  const panel = page.getByRole('dialog')
  await panel.getByRole('region', { name: '进行中 · 3' }).waitFor()
  await panel.getByText('打包中', { exact: true }).waitFor()
  await panel.getByText('转换中', { exact: true }).waitFor()
  await panel.getByRole('region', { name: '最近 24 小时' }).getByText('每日英语阅读').waitFor()
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/task-center-1440.png` })
  }
  await panel.getByRole('link', { name: /每日英语阅读.*对话导出/u }).click()
  await page.getByRole('dialog', { name: '导出 AI 对话' }).waitFor()
  await page.waitForURL((url) => url.pathname === '/runs/run-b' && !url.searchParams.has('export'))

  // A task that settles between polls is announced once, with a link to it.
  rows.aw_pdf_to_md_jobs[0] = { ...rows.aw_pdf_to_md_jobs[0], status: 'succeeded', updated: stamp(0) }
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.dispatchEvent(new Event('anyworkflow:tasks-changed')))
  await page.getByText('「数学讲义」已完成').waitFor()
  await page.getByRole('button', { name: '任务中心，2 个进行中' }).waitFor()
  await desktop.context.close()

  // Phone: the same panel as a bottom sheet, no horizontal overflow.
  for (const width of [320, 390]) {
    const phone = await open(width)
    page = phone.page
    await page.goto(`${baseUrl}/`)
    await page.getByRole('button', { name: '任务中心，2 个进行中' }).click()
    const sheet = page.getByRole('dialog', { name: '任务' })
    await sheet.waitFor()
    await sheet.getByText('计算机网络复习').waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`)
    assert.ok(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth), `sheet overflow ${width}`)
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/task-center-${width}.png` })
    await sheet.getByRole('link', { name: /计算机网络复习/u }).click()
    await page.waitForURL(/\/runs\/run-a$/u)
    await sheet.waitFor({ state: 'hidden' })
    await phone.context.close()
  }
  assert.deepEqual(errors, [])
  console.log('PASS: task center feed for Runs/conversions/exports, sidebar counts, export deep link, settle toast, phone sheet at 320/390px')
} finally {
  await browser.close()
}
