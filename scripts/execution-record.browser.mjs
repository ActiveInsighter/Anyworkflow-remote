// Run with npm run test:browser, or directly while npm run dev serves localhost:5173.
// Fixture: an Event whose queue plans 12 Acts (the opening link plus an 11-turn loop). Only persisted history may become components.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

const now = new Date().toISOString()
const base = { owner: 'owner-1', created: now, updated: now }
const run = { ...base, id: 'run-1', title: '高等数学核心题目', planText: '@run=x', familyId: 'run-1', status: 'running', origin: 'initial', requestedAction: 'none', completedTasks: 0, totalTasks: 1, versionMajor: 1, versionMinor: 0, executionMode: 'serial', scheduledAt: '' }
const task = { ...base, id: 'task-1', run: run.id, title: 'Task', status: 'running', requestedAction: 'none', runIndex: 0, completedEvents: 0, totalEvents: 1, compileError: '', lastError: '', orchestrationState: 'compiled', executorKind: 'browser' }
const queue = '@task=Task\n@event=Event\n<https://chatgpt.com/>\n@for i in range(0, 10) {\n  { 第%i%题 }\n}'
const event = { ...base, id: 'event-1', task: task.id, eventIndex: 0, localRunId: '', status: 'ready', terminalResult: '', attempt: 0, queueTextOverride: queue, progress: null, lastError: '', workerId: '' }
const historyEvent = { ...base, id: 'history-event-1', eventIndex: 0 }
const makeAct = (index, status) => ({ ...base, id: `act-${index + 1}`, event: historyEvent.id, actIndex: index, title: `Act ${index + 1}`, messageCount: 1, attempt: 1, status })
let acts = []
const makeMessage = (act, index) => ({ ...base, id: `message-${act}-${index}`, act: `act-${act}`, nodeIndex: index, attempt: 1, status: 'succeeded', userMarkdown: '问', assistantMarkdown: '答', sentAt: now, receivedAt: now })

await page.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1', email: 'test@example.invalid' }, baseUrl: 'https://pb.example.invalid' })))
await page.route('https://pb.example.invalid/**', async (route) => {
  const url = new URL(route.request().url())
  const collection = url.pathname.split('/')[3]
  const recordId = url.pathname.split('/')[5]
  let result = []
  if (collection === 'aw_dispatch_runs') result = [run]
  if (collection === 'aw_dispatch_tasks') result = [task]
  if (collection === 'aw_dispatch_events') result = [event]
  if (collection === 'aw_events') result = event.localRunId ? [historyEvent] : []
  if (collection === 'aw_acts') result = acts
  if (collection === 'aw_messages') {
    const actId = /act="([^"]+)"/u.exec(url.searchParams.get('filter') || '')?.[1] || ''
    result = acts.some((act) => act.id === actId) ? [makeMessage(actId.replace('act-', ''), 0)] : []
  }
  const perPage = Number(url.searchParams.get('perPage') || 20)
  const currentPage = Number(url.searchParams.get('page') || 1)
  await route.fulfill({ json: recordId ? result.find((row) => row.id === recordId) : { page: currentPage, perPage, totalItems: result.length, totalPages: Math.ceil(result.length / perPage), items: result.slice((currentPage - 1) * perPage, currentPage * perPage) } })
})

const actSections = () => page.locator('section[aria-label^="Act "]')
try {
  await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'}/runs/run-1?task=task-1&event=event-1`)

  // Waiting for an executor: twelve planned Acts, zero Act components.
  await page.getByText('0 / 12 Acts', { exact: true }).waitFor()
  await page.getByText('等待执行器领取', { exact: true }).first().waitFor()
  assert.equal(await actSections().count(), 0, 'unstarted Events render no Act components')
  assert.equal(await page.getByText('暂无消息，新消息将在同步后自动显示。').count(), 0, 'no empty message placeholders')
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/execution-waiting.png`, fullPage: true })

  // Running with three persisted Acts: exactly three components, the latest one expanded.
  event.status = 'running'
  event.localRunId = 'local-1'
  event.workerId = 'worker-1'
  event.progress = { index: 2, total: 12 }
  acts = [makeAct(0, 'succeeded'), makeAct(1, 'succeeded'), makeAct(2, 'unknown')]
  await actSections().nth(2).waitFor({ timeout: 15000 })
  assert.equal(await actSections().count(), 3, 'one component per persisted Act, not per planned Act')
  await page.getByText('进行中', { exact: true }).waitFor()
  await page.getByRole('button', { name: '刷新Act 3的消息' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '刷新Act 1的消息' }).count(), 0, 'earlier Acts start collapsed')
  await page.getByRole('button', { name: /Act 1/ }).first().click()
  await page.getByRole('button', { name: '刷新Act 1的消息' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '查看消息 1' }).count(), 2)

  // Each chevron follows its own row: a closed Act inside an open Event must not read as open.
  const actTrigger = (n) => actSections().nth(n).locator('[data-slot=collapsible-trigger]').first()
  const chevronTransform = (n) => actTrigger(n).locator('svg').last().evaluate((el) => getComputedStyle(el).transform)
  assert.equal(await actTrigger(1).getAttribute('aria-expanded'), 'false')
  assert.equal(await chevronTransform(1), 'none', 'closed Act chevron is not rotated by an open ancestor')

  // A later Act appears as soon as it is persisted; the open row follows it, the user's choice stays.
  acts.push(makeAct(3, 'unknown'))
  await actSections().nth(3).waitFor({ timeout: 15000 })
  assert.equal(await actSections().count(), 4)
  await page.getByRole('button', { name: '刷新Act 4的消息' }).waitFor()
  assert.equal(await actTrigger(0).getAttribute('aria-expanded'), 'true', 'manually opened Act survives refresh')
  await page.getByRole('button', { name: '刷新Act 3的消息' }).waitFor({ state: 'detached' })

  // Collapse everything, then jump back to the live progress.
  await page.getByRole('button', { name: '全部收起' }).click()
  await page.waitForFunction(() => !document.querySelector('[data-slot=collapsible-trigger][aria-expanded=true]'))
  await page.getByRole('button', { name: '定位进度' }).click()
  await page.getByRole('button', { name: '刷新Act 4的消息' }).waitFor()

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`)
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/execution-${width}.png`, fullPage: true })
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/execution-dark.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: no components for planned Acts, persisted Acts only, latest Act open, per-row chevrons, live Act arrival keeps manual state, collapse/follow, 320/390/768/1440px, dark mode')
} finally {
  await browser.close()
}
