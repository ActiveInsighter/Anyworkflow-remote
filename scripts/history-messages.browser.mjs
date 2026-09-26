// Run with Vite on localhost:5173 and Playwright available (or PLAYWRIGHT_MODULE set).
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const base = { owner: 'owner-1', created: '2026-09-26T14:17:00Z', updated: '2026-09-26T14:17:00Z' }
const run = { ...base, id: 'run-1', title: '408真题总结0926', planText: '@run=408真题总结0926', familyId: 'run-1', status: 'succeeded', origin: 'initial', requestedAction: 'none', completedTasks: 1, totalTasks: 1, versionMajor: 1, versionMinor: 0, executionMode: 'serial', scheduledAt: '' }
const task = { ...base, id: 'task-1', run: run.id, title: '整理历年真题', status: 'succeeded', requestedAction: 'none', runIndex: 0, completedEvents: 1, totalEvents: 1, compileError: '' }
const event = { ...base, id: 'event-1', task: task.id, eventIndex: 0, localRunId: '', status: 'terminal', terminalResult: 'succeeded', attempt: 1, queueTextOverride: '@event=知识点总结\n{问题一}\n{问题二}', progress: { index: 24, total: 24 }, lastError: '' }
const historyEvent = { ...base, id: 'history-event-1', eventIndex: 0 }
const act = { ...base, id: 'act-1', event: historyEvent.id, actIndex: 0, title: '分析与归纳', messageCount: 24, attempt: 1, status: 'succeeded' }
let rows = []
let detailRequests = 0
let failMessages = false
const makeMessage = (index) => ({ ...base, id: `message-${index}`, act: act.id, nodeIndex: index, attempt: 1, status: 'unknown', userMarkdown: '请归纳计算机网络的重点。', assistantMarkdown: '', sentAt: base.created, receivedAt: '' })
await page.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1', email: 'test@example.invalid' }, baseUrl: 'https://pb.example.invalid' })))
await page.route('https://pb.example.invalid/**', async route => {
  const url = new URL(route.request().url())
  const collection = url.pathname.split('/')[3]
  const recordId = url.pathname.split('/')[5]
  let result = []
  if (collection === 'aw_dispatch_runs') result = [run]
  if (collection === 'aw_dispatch_tasks') result = [task]
  if (collection === 'aw_dispatch_events') result = [event]
  if (collection === 'aw_events') result = event.localRunId ? [historyEvent] : []
  if (collection === 'aw_acts') result = [act]
  if (collection === 'aw_messages') {
    if (failMessages) return route.fulfill({ status: 500, json: { message: '测试网络中断' } })
    result = rows
    if (recordId) detailRequests++
    else assert.ok(url.searchParams.get('fields'), 'list must project metadata only')
  }
  const perPage = Number(url.searchParams.get('perPage') || 20)
  const currentPage = Number(url.searchParams.get('page') || 1)
  await route.fulfill({ json: recordId ? result.find(row => row.id === recordId) : { page: currentPage, perPage, totalItems: result.length, totalPages: Math.ceil(result.length / perPage), items: result.slice((currentPage - 1) * perPage, currentPage * perPage) } })
})
try {
  await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'}/runs/run-1?task=task-1&event=event-1`)
  await page.getByText('暂无消息，新消息将在同步后自动显示。').first().waitFor()
  assert.equal(await page.getByRole('button', { name: /^查看消息/ }).count(), 0)
  // Dispatch completed before the local run/history identifiers are synchronized.
  event.localRunId = 'local-1'
  await page.getByText('0 条消息', { exact: true }).waitFor({ timeout: 15000 })
  rows = [makeMessage(17)]
  await page.getByRole('button', { name: '查看消息 1', exact: true }).waitFor({ timeout: 12000 })
  assert.equal(await page.getByRole('button', { name: /^查看消息/ }).count(), 1)
  assert.equal(detailRequests, 0, 'no message bodies before opening')
  await page.getByRole('button', { name: '查看消息 1', exact: true }).click()
  await page.getByText('请归纳计算机网络的重点。', { exact: true }).waitFor()
  rows[0] = { ...rows[0], assistantMarkdown: '已完成：网络分层、可靠传输和拥塞控制。', status: 'succeeded', receivedAt: base.updated }
  await page.getByText('已完成：网络分层、可靠传输和拥塞控制。', { exact: true }).waitFor({ timeout: 12000 })
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('button', { name: '查看消息 1', exact: true }).evaluate(el => el === document.activeElement), true)
  rows.push(makeMessage(23))
  await page.getByRole('button', { name: '查看消息 2', exact: true }).waitFor({ timeout: 12000 })
  assert.equal(await page.getByRole('button', { name: /^查看消息/ }).count(), 2)
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`)
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/messages-${width}.png`, fullPage: true })
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/messages-dark.png`, fullPage: true })
  failMessages = true
  await page.getByRole('button', { name: '刷新分析与归纳的消息' }).click()
  await page.getByText(/消息加载失败/).waitFor()
  failMessages = false
  rows = Array.from({ length: 21 }, (_, index) => makeMessage(index + 17))
  await page.getByRole('button', { name: '刷新分析与归纳的消息' }).click()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByRole('button', { name: '查看消息 21', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: /^查看消息/ }).count(), 1)
  assert.deepEqual(errors, [])
  console.log('PASS: late history after completion, 0→1→2 messages, sparse IDs, live details, focus, pagination, error recovery, 320/390/768/1440px, dark mode')
} finally {
  await browser.close()
}
