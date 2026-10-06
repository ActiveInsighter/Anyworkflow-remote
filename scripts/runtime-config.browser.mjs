// Runtime configuration UI proof against an isolated API, never production records.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5184'
const errors = []; page.on('pageerror', error => errors.push(error.message))
const config = (timeout = 30) => ({ schemaVersion: 1, browser: { replyTimeoutMinutes: timeout,
  randomWait: { enabled: false, minSeconds: 1, maxSeconds: 10 }, deferredReply: { enabled: false, delayMinutes: 10 } } })
let defaults = { owner: 'owner-1', schemaVersion: 1, revision: 1, config: config() }
const plan = '@run=Runtime proof\n@task Task {\n@event Event {\n{ hello }\n}\n}'
const parent = { id: 'parent', owner: 'owner-1', title: 'Runtime proof', planText: plan, status: 'draft', origin: 'initial',
  familyId: 'parent', versionMajor: 1, versionMinor: 0, commandVersion: 0, requestedAction: 'none', executionMode: 'serial',
  maxConcurrency: 1, runtimeConfig: config(45), runtimeConfigChecksum: 'a'.repeat(64), runtimeDefaultRevision: 1 }
const records = new Map([['parent', parent]]), writes = []
let heldDefaults = null
await page.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture',
  record: { id: 'owner-1', email: 'test@example.invalid' }, baseUrl: 'https://pb.example.invalid' })))
await page.route('https://pb.example.invalid/**', async route => {
  const request = route.request(), url = new URL(request.url()), data = request.postDataJSON()
  if (url.pathname === '/api/anyworkflow/runtime-defaults') {
    if (request.method() === 'GET') {
      if (heldDefaults) await heldDefaults.promise
      return route.fulfill({ json: defaults })
    }
    if (data.expectedRevision !== defaults.revision) return route.fulfill({ status: 409, json: { message: '默认配置已更新，请重新加载后再保存' } })
    defaults = { ...defaults, revision: defaults.revision + 1, config: data.config }
    writes.push(data); return route.fulfill({ json: defaults })
  }
  const collection = url.pathname.split('/')[3], id = url.pathname.split('/')[5]
  if (request.method() !== 'GET') {
    writes.push(data)
    const saved = request.method() === 'POST' ? { ...parent, ...data, familyId: data.id } : { ...records.get(id), ...data }
    records.set(saved.id, saved); return route.fulfill({ json: saved })
  }
  if (collection === 'aw_dispatch_runs' && id) return route.fulfill({ json: records.get(id) })
  const items = collection === 'aw_dispatch_runs' ? [...records.values()] : []
  return route.fulfill({ json: { page: 1, perPage: 20, totalItems: items.length, totalPages: 1, items } })
})
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
}
try {
  for (const width of [320, 390, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${base}/settings`)
    await page.getByLabel('回复超时（分钟）').waitFor()
    await noOverflow()
  }
  await page.getByLabel('回复超时（分钟）').fill('60')
  await page.getByRole('button', { name: '保存默认配置', exact: true }).click()
  await page.getByText('默认运行配置已保存', { exact: true }).waitFor()
  assert.equal(defaults.config.browser.replyTimeoutMinutes, 60)
  // Conflicts remain visible and cannot silently overwrite another tab.
  defaults = { ...defaults, revision: defaults.revision + 1, config: config(90) }
  await page.getByLabel('回复超时（分钟）').fill('75')
  await page.getByRole('button', { name: '保存默认配置', exact: true }).click()
  await page.getByText('默认配置已更新，请重新加载后再保存', { exact: true }).waitFor()
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[type=number]')?.value === '90')
  await page.goto(`${base}/runs/parent/edit`)
  await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: '运行配置', exact: true }).click()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '45')
  await page.getByLabel('回复超时（分钟）').fill('55')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.waitForTimeout(650)
  await page.reload()
  await page.getByRole('button', { name: '恢复', exact: true }).waitFor()
  await page.getByRole('button', { name: '运行配置', exact: true }).click()
  let releaseDefaults
  heldDefaults = { promise: new Promise(resolve => { releaseDefaults = resolve }) }
  const pendingDefaults = page.waitForRequest(request => request.url().endsWith('/api/anyworkflow/runtime-defaults') && request.method() === 'GET')
  await page.getByRole('button', { name: '使用当前默认配置', exact: true }).click()
  await pendingDefaults
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  const defaultsResponse = page.waitForResponse(response => response.url().endsWith('/api/anyworkflow/runtime-defaults'))
  releaseDefaults(); await defaultsResponse; heldDefaults = null
  await page.waitForTimeout(100)
  await page.getByRole('button', { name: '运行配置', exact: true }).click()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '55', 'config-only local draft restores')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByText('草稿已保存', { exact: true }).waitFor()
  assert.equal(records.get('parent').runtimeConfig.browser.replyTimeoutMinutes, 55)
  // Legacy drafts require explicit confirmation and remain untouched until successful save.
  await page.evaluate(({ plan, config }) => localStorage.setItem('anyworkflow.editor-draft.owner-1:run:parent', JSON.stringify({
    source: plan, title: 'Runtime proof', mode: 'serial', maxConcurrency: 1, templateTitle: '', scheduledAt: '',
    runtimeConfig: config, savedAt: Date.now(),
  })), { plan, config: config(77) })
  await page.reload()
  await page.getByText('旧版草稿未记录后端地址，请确认属于当前后端后恢复。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '运行配置', exact: true }).click()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '55', 'legacy draft is not automatically applied')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('button', { name: '运行配置', exact: true }).click()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '77')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByText('草稿已保存', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('anyworkflow.editor-draft.owner-1:run:parent')), null)
  await page.goto(`${base}/runs/new`)
  await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: '运行配置', exact: true }).click()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '90')
  await page.getByLabel('随机等待', { exact: true }).check()
  await page.getByLabel('最短等待（秒）').fill('20')
  assert.equal(await page.getByRole('button', { name: '完成', exact: true }).isDisabled(), true)
  await page.getByLabel('最长等待（秒）').fill('25')
  await page.getByLabel('回复超时（分钟）').fill('120')
  await page.setViewportSize({ width: 320, height: 900 }); await noOverflow()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await noOverflow()
  await page.getByRole('button', { name: '保存', exact: true }).last().click()
  await page.waitForURL(/\/runs\/[a-z0-9]{15}\/edit$/)
  assert.equal(writes.at(-1).runtimeConfig.browser.replyTimeoutMinutes, 120)
  assert.deepEqual(writes.at(-1).runtimeConfig.browser.randomWait, { enabled: true, minSeconds: 20, maxSeconds: 25 })
  assert.equal(defaults.config.browser.replyTimeoutMinutes, 90)
  assert.deepEqual(errors, [])
  console.log('PASS runtime UI: defaults/CAS, existing snapshot, config-only restore, per-Run override, numeric validation, 320/390/760/1440px, clean console')
} finally { await browser.close() }
