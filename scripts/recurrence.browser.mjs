// Exercise deployed assets with an isolated API; never submits real workflow work.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.setDefaultTimeout(15000)
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5184'
const config = { schemaVersion: 1, browser: { replyTimeoutMinutes: 45, randomWait: { enabled: false, minSeconds: 1, maxSeconds: 10 }, deferredReply: { enabled: false, delayMinutes: 10 } } }
const errors = [], writes = [], runs = new Map(), schedules = new Map()
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture', record: { id: 'owner', email: 'test@example.invalid' }, baseUrl: 'https://pb.example.invalid' })))
await page.route('https://pb.example.invalid/**', async route => {
  const req = route.request(), url = new URL(req.url()), body = req.postDataJSON()
  if (url.pathname === '/api/anyworkflow/runtime-defaults') return route.fulfill({ json: { owner: 'owner', schemaVersion: 1, revision: 1, config } })
  if (url.pathname.endsWith('/state')) {
    const id = url.pathname.split('/').at(-2), current = schedules.get(id)
    if (body.expectedRevision !== current.revision) return route.fulfill({ status: 409, json: { message: '重复计划已更新，请刷新后重试' } })
    const saved = { ...current, enabled: body.enabled, revision: current.revision + 1 }
    schedules.set(id, saved); writes.push(body); return route.fulfill({ json: saved })
  }
  const name = url.pathname.split('/')[3], id = url.pathname.split('/')[5]
  if (req.method() === 'DELETE') { schedules.delete(id); return route.fulfill({ status: 204 }) }
  if (req.method() !== 'GET') {
    writes.push(body)
    const saved = { owner: 'owner', ...body, id: body.id || id, familyId: body.id || id, versionNumber: 1, versionMajor: 1, versionMinor: 0, origin: 'initial', runtimeConfig: body.runtimeConfig || config }
    runs.set(saved.id, saved)
    if (saved.status === 'queued' && saved.recurrence) {
      saved.recurrenceSchedule = saved.id
      schedules.set(saved.id, { id: saved.id, owner: 'owner', sourceRun: saved.id, title: saved.title, rule: saved.recurrence, enabled: true, revision: 1,
        nextRunAt: saved.scheduledAt, lastRun: saved.id, skippedCount: 0, lastSkippedAt: '', lastError: '' })
    }
    return route.fulfill({ json: saved })
  }
  if (name === 'aw_dispatch_runs' && id) return route.fulfill({ json: runs.get(id) })
  const items = name === 'aw_dispatch_runs' ? [...runs.values()] : name === 'aw_run_schedules' ? [...schedules.values()] : []
  return route.fulfill({ json: { page: 1, perPage: 20, totalItems: items.length, totalPages: items.length ? 1 : 0, items } })
})
async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true) }
async function screenshot(name) { if (process.env.SCREENSHOT_DIR) { await mkdir(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png`, fullPage: true }) } }
try {
  console.log('Start daily editor proof')
  await page.goto(base + '/runs/new')
  await page.locator('.cm-content').waitFor()
  await page.locator('.cm-content').fill('@run=Daily proof\n@task Task {\n@event Event {\n{ hello }\n}\n}')
  await page.getByRole('button', { name: '立即', exact: true }).click()
  await page.getByRole('radio', { name: '每天', exact: true }).click()
  await page.getByLabel('每天执行时间', { exact: true }).fill('')
  await page.getByRole('radio', { name: '立即', exact: true }).click()
  await page.getByRole('radio', { name: '每天', exact: true }).click()
  await page.getByLabel('每天执行时间', { exact: true }).fill('09:30')
  await page.getByLabel('时区（固定 UTC 偏移）').selectOption('480')
  for (const width of [320, 390, 760, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(); await screenshot('daily-picker-' + width) }
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.setViewportSize({ width: 320, height: 900 }); await noOverflow()
  await page.getByRole('button', { name: '保存', exact: true }).last().click()
  await page.waitForURL(/\/runs\/[a-z0-9]{15}\/edit$/)
  const id = page.url().split('/').at(-2)
  assert.deepEqual(runs.get(id).recurrence, { frequency: 'daily', time: '09:30', utcOffsetMinutes: 480 })
  assert.equal(schedules.size, 0, 'draft must not activate recurrence')
  await page.getByRole('button', { name: '每天 09:30', exact: true }).waitFor()
  await page.getByRole('button', { name: '每天 09:30', exact: true }).click()
  await page.getByLabel('每天执行时间', { exact: true }).fill('10:45')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.waitForTimeout(550)
  await page.reload()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('button', { name: '每天 10:45', exact: true }).waitFor()
  await page.getByRole('button', { name: '启用重复', exact: true }).click()
  await page.waitForURL(new RegExp('/runs/' + id + '$'))
  assert.equal(schedules.size, 1)
  assert.equal(schedules.get(id).rule.time, '10:45')
  assert.equal(runs.get(id).runtimeConfig.browser.replyTimeoutMinutes, 45)
  await page.getByRole('link', { name: '管理重复计划', exact: true }).click()
  await page.waitForURL(/\/schedules$/)
  await page.getByRole('button', { name: '暂停重复', exact: true }).waitFor()
  for (const width of [320, 390, 760, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.getByText('Daily proof', { exact: true }).waitFor(); await noOverflow(); await screenshot('daily-schedules-' + width) }
  await page.getByRole('button', { name: '暂停重复', exact: true }).click()
  await page.getByRole('button', { name: '恢复重复', exact: true }).waitFor()
  assert.equal(schedules.get(id).enabled, false)
  await page.getByRole('button', { name: '恢复重复', exact: true }).click()
  await page.getByRole('button', { name: '暂停重复', exact: true }).waitFor()
  assert.equal(schedules.get(id).enabled, true)
  // A concurrent control edit must surface the conflict.
  schedules.set(id, { ...schedules.get(id), revision: schedules.get(id).revision + 1 })
  await page.getByRole('button', { name: '暂停重复', exact: true }).click()
  await page.getByText('重复计划已更新，请刷新后重试', { exact: true }).waitFor()
  await page.getByRole('button', { name: '删除计划', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await page.getByText('暂无重复计划', { exact: true }).waitFor()
  assert.equal(runs.size, 1, 'deleting a schedule preserves Run history')
  assert.deepEqual(errors, [])
  console.log('PASS daily UI: rule/timezone, draft restore, publish, snapshot, pause/resume/conflict/delete, four responsive widths')
} finally { await browser.close() }
