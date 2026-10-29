// Runtime configuration UI proof against an isolated API, never production records.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const config = (timeout = 30) => ({
  schemaVersion: 1,
  browser: {
    replyTimeoutMinutes: timeout,
    randomWait: { enabled: false, minSeconds: 1, maxSeconds: 10 },
    deferredReply: { enabled: false, delayMinutes: 10 },
  },
})
let defaults = { owner: 'owner-1', schemaVersion: 1, revision: 1, config: config() }
const plan = '@run=Runtime proof\n@task Task {\n@event Event {\n{ hello }\n}\n}'
const parent = {
  id: 'parent',
  owner: 'owner-1',
  title: 'Runtime proof',
  planText: plan,
  status: 'draft',
  origin: 'initial',
  familyId: 'parent',
  versionMajor: 1,
  versionMinor: 0,
  commandVersion: 0,
  requestedAction: 'none',
  executionMode: 'serial',
  maxConcurrency: 1,
  runtimeConfig: config(45),
  runtimeConfigChecksum: 'a'.repeat(64),
  runtimeDefaultRevision: 1,
}
const records = new Map([['parent', parent]]),
  writes = []
let heldDefaults = null
await page.addInitScript(() =>
  localStorage.setItem(
    'anyworkflow.auth.session.v1',
    JSON.stringify({
      token: 'fixture',
      record: { id: 'owner-1', email: 'test@example.invalid' },
      baseUrl: 'https://pb.example.invalid',
    }),
  ),
)
await page.route('https://pb.example.invalid/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    data = request.postDataJSON()
  if (url.pathname === '/api/anyworkflow/runtime-defaults') {
    if (request.method() === 'GET') {
      if (heldDefaults) await heldDefaults.promise
      return route.fulfill({ json: defaults })
    }
    if (data.expectedRevision !== defaults.revision)
      return route.fulfill({ status: 409, json: { message: '默认配置已更新，请重新加载后再保存' } })
    defaults = {
      ...defaults,
      revision: defaults.revision + 1,
      schemaVersion: data.config.schemaVersion,
      config: data.config,
    }
    writes.push(data)
    return route.fulfill({ json: defaults })
  }
  const collection = url.pathname.split('/')[3],
    id = url.pathname.split('/')[5]
  if (request.method() !== 'GET') {
    writes.push(data)
    const saved =
      request.method() === 'POST' ? { ...parent, ...data, familyId: data.id } : { ...records.get(id), ...data }
    records.set(saved.id, saved)
    return route.fulfill({ json: saved })
  }
  if (collection === 'aw_dispatch_runs' && id) return route.fulfill({ json: records.get(id) })
  const items = collection === 'aw_dispatch_runs' ? [...records.values()] : []
  return route.fulfill({ json: { page: 1, perPage: 20, totalItems: items.length, totalPages: 1, items } })
})
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
}
const main = 'https://chatgpt.com/',
  images = 'https://chatgpt.com/images',
  cloud = 'https://chatgpt.com/cloud'
const labels = {
  chatgpt: 'ChatGPT 主界面',
  'chatgpt-images': 'ChatGPT 图片界面',
  'chatgpt-cloud': 'ChatGPT Cloud 界面',
  'claude-new': 'Claude 主界面',
  'claude-code': 'Claude Code 界面',
}
const effective = (value, url = main) =>
  value.pageOverrides?.[url] ?? {
    browser: value.browser,
    modelSelection: value.modelSelection?.[
      url === cloud ? 'chatgptCloud' : url.startsWith('https://claude.ai') ? 'claude' : 'chatgpt'
    ] ?? { model: null, reasoningEffort: null },
  }
async function choose(id = 'chatgpt') {
  if (await page.getByRole('button', { name: '返回运行配置', exact: true }).count())
    await page.getByRole('button', { name: '返回运行配置', exact: true }).click()
  const name = new RegExp(labels[id] + '.*https')
  const link = page.getByRole('link', { name })
  await link.or(page.getByRole('button', { name })).click()
  await page.getByLabel('回复超时（分钟）').waitFor()
}
async function editorConfig(id = 'chatgpt') {
  await page.getByRole('button', { name: '运行配置', exact: true }).click()
  await choose(id)
}
async function done() {
  await page.getByRole('button', { name: '完成', exact: true }).click()
}
async function saveDefaults() {
  await page.getByRole('button', { name: '保存默认配置', exact: true }).click()
  await page.getByRole('button', { name: '保存默认配置', exact: true }).waitFor({ state: 'visible' })
  await page.waitForFunction(
    () =>
      document.querySelector('button') &&
      [...document.querySelectorAll('button')].some((b) => b.textContent === '保存默认配置' && b.disabled),
  )
}
const optionValues = (label) =>
  page
    .getByLabel(label, { exact: true })
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value))
try {
  for (const width of [320, 390, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${base}/settings`)
    await page.getByRole('navigation', { name: '设置目录' }).waitFor()
    assert.equal(await page.locator('input').count(), 0, 'settings home only contains a directory')
    await noOverflow()
    await page.getByRole('link', { name: /运行配置/ }).click()
    await page.getByLabel('默认开始链接').waitFor()
    assert.equal(await page.locator('input[type=number]').count(), 0)
    await noOverflow()
    await choose()
    await noOverflow()
  }
  await page.getByLabel('回复超时（分钟）').fill('60')
  await choose('chatgpt-images')
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '30')
  await page.getByLabel('回复超时（分钟）').fill('120')
  await page.getByLabel('ChatGPT 模型', { exact: true }).selectOption('GPT-5.6 Sol')
  await choose()
  assert.equal(
    await page.getByLabel('回复超时（分钟）').inputValue(),
    '60',
    'navigation preserves unsaved page settings',
  )
  await saveDefaults()
  assert.equal(defaults.config.schemaVersion, 4)
  assert.equal(effective(defaults.config).browser.replyTimeoutMinutes, 60)
  assert.equal(effective(defaults.config, images).browser.replyTimeoutMinutes, 120)
  assert.equal(effective(defaults.config).modelSelection.model, null)
  await page.reload()
  await page.getByLabel('回复超时（分钟）').waitFor()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '60')
  defaults = { ...defaults, revision: defaults.revision + 1, schemaVersion: 1, config: config(90) }
  await page.getByLabel('回复超时（分钟）').fill('75')
  await page.getByRole('button', { name: '保存默认配置', exact: true }).click()
  await page.getByText('默认配置已更新，请重新加载后再保存', { exact: true }).waitFor()
  // Leaving the runtime section requires an explicit decision; navigating within it retains edits.
  await page.getByRole('link', { name: '设置', exact: true }).first().click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '75')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[type=number]')?.value === '90')

  await page.goto(`${base}/runs/parent/edit`)
  await page.locator('.cm-content').waitFor()
  await editorConfig()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '45')
  await page.getByLabel('回复超时（分钟）').fill('55')
  await done()
  await page.waitForTimeout(650)
  await page.reload()
  await page.getByRole('button', { name: '恢复', exact: true }).waitFor()
  await editorConfig()
  let releaseDefaults
  heldDefaults = {
    promise: new Promise((resolve) => {
      releaseDefaults = resolve
    }),
  }
  const pending = page.waitForRequest(
    (request) => request.url().endsWith('/api/anyworkflow/runtime-defaults') && request.method() === 'GET',
  )
  await page.getByRole('button', { name: '使用当前默认配置', exact: true }).click()
  await pending
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  const response = page.waitForResponse((response) => response.url().endsWith('/api/anyworkflow/runtime-defaults'))
  releaseDefaults()
  await response
  heldDefaults = null
  await editorConfig()
  assert.equal(
    await page.getByLabel('回复超时（分钟）').inputValue(),
    '55',
    'late defaults response cannot replace restored draft',
  )
  await done()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByText('草稿已保存', { exact: true }).waitFor()
  assert.equal(effective(records.get('parent').runtimeConfig).browser.replyTimeoutMinutes, 55)

  await page.evaluate(
    ({ plan, config }) =>
      localStorage.setItem(
        'anyworkflow.editor-draft.owner-1:run:parent',
        JSON.stringify({
          source: plan,
          title: 'Runtime proof',
          mode: 'serial',
          maxConcurrency: 1,
          templateTitle: '',
          scheduledAt: '',
          runtimeConfig: config,
          savedAt: Date.now(),
        }),
      ),
    { plan, config: config(77) },
  )
  await page.reload()
  await page.getByText('旧版草稿未记录后端地址，请确认属于当前后端后恢复。', { exact: true }).waitFor()
  await editorConfig()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '55')
  await done()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await editorConfig()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '77')
  await done()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByText('草稿已保存', { exact: true }).waitFor()

  await page.goto(`${base}/settings/runtime/chatgpt`)
  await page.getByLabel('ChatGPT 模型', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('ChatGPT 思考程度', { exact: true }).isDisabled(), true)
  assert.deepEqual(await optionValues('ChatGPT 模型'), ['', 'GPT-6', 'GPT-5.6 Sol'])
  await page.getByLabel('ChatGPT 模型', { exact: true }).selectOption('GPT-6')
  await page.getByLabel('ChatGPT 思考程度', { exact: true }).selectOption('high')
  await choose('claude-new')
  await page.getByLabel('Claude 模型', { exact: true }).selectOption('Sonnet 5.5')
  await page.getByLabel('Claude 思考程度', { exact: true }).selectOption('xhigh')
  await page.getByLabel('Claude 模型', { exact: true }).selectOption('Opus 4.6')
  assert.equal(await page.getByLabel('Claude 思考程度', { exact: true }).inputValue(), '')
  await page.getByLabel('Claude 模型', { exact: true }).selectOption('Haiku 4.5')
  assert.equal(await page.getByLabel('Claude 思考程度', { exact: true }).isDisabled(), true)
  await page.getByLabel('Claude 模型', { exact: true }).selectOption('Sonnet 5.5')
  await page.getByLabel('Claude 思考程度', { exact: true }).selectOption('xhigh')
  await choose('claude-code')
  assert.equal(
    await page.getByLabel('Claude 模型', { exact: true }).inputValue(),
    '',
    'Claude Code preferences are independent',
  )
  await page.getByLabel('回复超时（分钟）').fill('180')
  await saveDefaults()
  assert.equal(effective(defaults.config).modelSelection.model, 'GPT-6')
  assert.equal(effective(defaults.config, 'https://claude.ai/code').browser.replyTimeoutMinutes, 180)
  await page.reload()
  await page.getByLabel('回复超时（分钟）').waitFor()
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '180')

  await page.goto(`${base}/runs/new`)
  await page.locator('.cm-content').waitFor()
  await editorConfig('chatgpt-images')
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '90')
  assert.equal(await page.getByLabel('自动回收延迟（分钟）').isDisabled(), true)
  await page.getByLabel('异步回收', { exact: true }).check()
  await page.getByLabel('自动回收延迟（分钟）').fill('7')
  await page.getByLabel('随机等待', { exact: true }).check()
  await page.getByLabel('最短等待（秒）').fill('20')
  assert.equal(await page.getByRole('button', { name: '完成', exact: true }).isDisabled(), true)
  await page.getByLabel('最长等待（秒）').fill('25')
  await page.getByLabel('回复超时（分钟）').fill('120')
  await choose()
  assert.equal(await page.getByLabel('异步回收', { exact: true }).isChecked(), false, 'async collection settings are scoped to the page')
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '90')
  assert.equal(await page.getByLabel('ChatGPT 模型', { exact: true }).inputValue(), 'GPT-6')
  await page.getByLabel('ChatGPT 模型', { exact: true }).selectOption('GPT-5.6 Sol')
  await choose('chatgpt-cloud')
  await page.getByLabel('ChatGPT Cloud 模型', { exact: true }).selectOption('GPT-6.1 Sol')
  assert.deepEqual(await optionValues('ChatGPT Cloud 思考程度'), ['', 'low', 'medium', 'high', 'xhigh'])
  await page.getByLabel('ChatGPT Cloud 思考程度', { exact: true }).selectOption('high')
  for (const width of [320, 390, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow()
  }
  await page.getByRole('button', { name: '返回运行配置', exact: true }).click()
  await page.getByLabel('默认开始链接', { exact: true }).selectOption(cloud)
  await done()
  await page.waitForTimeout(650)
  await page.reload()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await editorConfig('chatgpt-cloud')
  assert.equal(await page.getByLabel('ChatGPT Cloud 模型', { exact: true }).inputValue(), 'GPT-6.1 Sol')
  assert.equal(await page.getByLabel('ChatGPT Cloud 思考程度', { exact: true }).inputValue(), 'high')
  await choose('chatgpt-images')
  assert.equal(await page.getByLabel('回复超时（分钟）').inputValue(), '120')
  assert.equal(await page.getByLabel('异步回收', { exact: true }).isChecked(), true)
  assert.equal(await page.getByLabel('自动回收延迟（分钟）').inputValue(), '7')
  if (process.env.SCREENSHOT_DIR) {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/editor-runtime-mobile.png` })
  }
  await done()
  await page.getByRole('button', { name: '保存', exact: true }).last().click()
  await page.waitForURL(/\/runs\/[a-z0-9]{15}\/edit$/)
  assert.equal(writes.at(-1).runtimeConfig.schemaVersion, 4)
  assert.equal(writes.at(-1).runtimeConfig.defaultStartUrl, cloud)
  assert.equal(effective(writes.at(-1).runtimeConfig, images).browser.replyTimeoutMinutes, 120)
  assert.deepEqual(effective(writes.at(-1).runtimeConfig, images).browser.deferredReply, { enabled: true, delayMinutes: 7 })
  assert.equal(
    effective(defaults.config).modelSelection.model,
    'GPT-6',
    'per-Run changes never modify account defaults',
  )
  // Locked reruns show the original snapshot and allow navigation through all page settings.
  records.set('locked', { ...records.get('parent'), id: 'locked', origin: 'rerun', parentRun: 'parent' })
  await page.goto(`${base}/runs/locked/edit`)
  await page.locator('.cm-content').waitFor()
  await editorConfig('chatgpt-images')
  assert.equal(await page.getByLabel('回复超时（分钟）').isDisabled(), true)
  await done()
  for (const section of ['appearance', 'connection', 'shortcuts']) {
    await page.goto(`${base}/settings/${section}`)
    await page.locator('h1').waitFor()
    await noOverflow()
  }
  await page.goto(`${base}/settings`)
  await page.getByRole('navigation', { name: '设置目录' }).waitFor()
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/settings-mobile.png` })
  assert.deepEqual(errors, [])
  console.log(
    'PASS hierarchical settings/editor: independent page timing and models, real URLs, defaults CAS, navigation drafts, restore races, immutable rerun, 320/390/760/1440px',
  )
} finally {
  await browser.close()
}
