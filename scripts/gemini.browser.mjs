import { selectOption, selectOptions } from './select-helpers.mjs'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
const fileId = '11111111-1111-4111-8111-111111111111.md'
const content = '# 第一节\n原始正文\n<!-- aw:split -->\n# 第二节\n后续正文'
const file = { id: fileId, fileName: '分段讲义.md', size: Buffer.byteLength(content), sourceUrl: `https://remote.example.invalid/api/library/sources/${fileId}`, expiresAt: '', createdAt: '2026-11-15T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z', folder: '' }
let jobs = [], posts = [], loseOnce = false, wakes = 0, longReply = false
let config = { owner: 'owner-1', revision: 0, config: { model: 'gemini-3.5-flash-lite', systemPrompt: '', delimiter: '<!-- aw:split -->', concurrency: 5, thinkingLevel: '', maxOutputTokens: 8192, rpmPerKey: 15, rpdPerKey: 500 } }
let saved = []
const catalog = { provider: 'gemini', status: 'ready', syncedAt: '2026-11-15T00:00:00Z', models: [{ id: 'gemini-example-latest', displayName: 'Gemini latest', description: '', inputTokenLimit: 1000000, outputTokenLimit: 65536, methods: ['generateContent'], thinking: true }] }
const listing = items => ({ page: 1, perPage: 20, totalItems: items.length, totalPages: 1, items })
await context.route('**/api/file-conversion/wake', route => { wakes++; return route.fulfill({ status: 202, json: {} }) })
await context.route('**/api/library/files**', route => {
  const url = new URL(route.request().url())
  assert.equal(route.request().headers().authorization, 'Bearer fixture-token')
  if (url.pathname.endsWith('/import')) return route.fulfill({ json: { done: true, unavailable: 0 } })
  if (url.pathname.endsWith('/text')) return route.fulfill({ json: { id: fileId, content } })
  if (url.pathname.endsWith(fileId)) return route.fulfill({ json: file })
  assert.equal(url.searchParams.get('ext'), 'md')
  return route.fulfill({ json: { items: [file], cursor: '' } })
})

function messagesFor(job) {
  return Array.from({ length: job.totalChunks }, (_, index) => index + 1).map(index => ({ id: String(index).repeat(15), owner: 'owner-1', job: job.id, index, part: index, sourceName: file.fileName, status: index === 1 ? 'succeeded' : 'failed', reply: index === 1 ? (longReply ? Array.from({ length: 100 }, (_, line) => `第 ${line + 1} 行：完整的长回复内容，用于核对消息滚动。`).join('\n\n') : '# 逐段保存的回复\n<script>window.unsafe = true</script>') : '已保留的截断正文', inputText: index === 1 ? '# 第一节\n原始正文' : '# 第二节', error: index === 2 ? '回复达到输出上限' : '', finishReason: index === 2 ? 'MAX_TOKENS' : 'STOP', response: index === 1 ? { version: 1, protocol: 'interactions', parts: [{ id: 's0', type: 'reasoning', text: '公开的思考摘要' }, { id: 's1', type: 'tool-call', name: 'code_execution', callId: 'call-1', data: { code: 'print(42)' } }, { id: 's2', type: 'tool-result', name: 'code_execution', callId: 'call-1', data: { output: '42' } }], metadata: { status: 'completed', citations: [{ uri: 'https://example.com/source', title: '参考资料' }] }, capture: { totalParts: 3, omittedParts: 0, truncated: false } } : null, usage: index === 1 ? { totalTokenCount: 94123, promptTokenCount: 40000, candidatesTokenCount: 2000, thoughtsTokenCount: 30000, toolUseTokenCount: 22123, cachedContentTokenCount: 5000, agentStepCount: 8 } : { totalTokenCount: 123 } }))
}
await context.route('https://pb.example.invalid/**', route => {
  const request = route.request(), url = new URL(request.url()), body = ['POST', 'PUT'].includes(request.method()) ? request.postDataJSON() : null
  if (url.pathname.includes('/aw_file_conversion_configs/records')) return route.fulfill({ json: listing([{ id: 'config-1', owner: 'owner-1', conversionType: 'pdf_to_md', revision: 1, systemPrompt: '', options: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } }]) })
  if (url.pathname.endsWith('/gemini/config')) {
    if (request.method() === 'PUT') config = { ...config, config: body.config, revision: config.revision + 1 }
    return route.fulfill({ json: config })
  }
  if (url.pathname.endsWith('/models/catalog')) return route.fulfill({ json: catalog })
  if (url.pathname.endsWith('/models/saved')) {
    if (body) saved = [{ id: 'savedmodel00001', owner: 'owner-1', provider: 'gemini', name: body.name || 'Gemini latest', modelId: body.modelId }]
    return route.fulfill({ json: body ? saved[0] : saved })
  }
  if (url.pathname.includes('/models/saved/')) { saved = []; return route.fulfill({ json: { deleted: true } }) }
  if (url.pathname.endsWith('/gemini/preview')) {
    assert.equal(body.sources[0].content, content)
    return route.fulfill({ json: { totalChunks: 2, chunks: [{ index: 1, sourceName: file.fileName, part: 1, bytes: 30, excerpt: '# 第一节\n原始正文' }, { index: 2, sourceName: file.fileName, part: 2, bytes: 30, excerpt: '# 第二节\n后续正文' }] } })
  }
  if (url.pathname.endsWith('/gemini/jobs')) {
    posts.push(body)
    let job = jobs.find(item => item.id === body.id)
    if (!job) {
      job = { ...body, owner: 'owner-1', status: 'queued', totalChunks: body.sources.length ? 2 : 1, completedChunks: 0, failedChunks: 0, sources: body.sources.map(source => ({ id: source.id, name: source.name })), options: { concurrency: body.concurrency, maxOutputTokens: body.maxOutputTokens, thinkingLevel: body.thinkingLevel }, created: '2026-11-15T01:00:00Z', updated: '2026-11-15T01:00:00Z', error: '', githubRunId: '123' }
      jobs.unshift(job)
    }
    if (loseOnce) { loseOnce = false; return route.fulfill({ status: 503, json: { message: '提交响应丢失，请重试' } }) }
    return route.fulfill({ json: job })
  }
  if (url.pathname.endsWith('/cancel')) {
    Object.assign(jobs.find(job => url.pathname.includes(job.id)), { status: 'canceled', cancelRequested: true })
    return route.fulfill({ json: jobs.find(job => url.pathname.includes(job.id)) })
  }
  if (/\/gemini\/jobs\/[^/]+$/.test(url.pathname) && request.method() === 'DELETE') {
    jobs = jobs.filter(item => !url.pathname.endsWith(item.id))
    return route.fulfill({ json: { deleted: true } })
  }
  if (/\/gemini\/jobs\/[^/]+$/.test(url.pathname) && request.method() === 'GET') {
    const job = jobs.find(item => url.pathname.endsWith(item.id))
    return route.fulfill({ json: { job, messages: messagesFor(job).map(({ reply, inputText, usage, ...summary }) => ({ ...summary, updated: job.updated })) } })
  }
  if (/\/gemini\/jobs\/[^/]+\/messages\/[^/]+$/.test(url.pathname)) {
    const jobId = url.pathname.split('/').at(-3)
    const job = jobs.find(item => item.id === jobId)
    return route.fulfill({ json: messagesFor(job).find(item => url.pathname.endsWith(item.id)) })
  }
  if (url.pathname.includes('/aw_gemini_jobs/records/')) return route.fulfill({ json: jobs.find(job => url.pathname.endsWith(job.id)) })
  if (url.pathname.includes('/aw_gemini_jobs/records')) return route.fulfill({ json: listing(jobs) })
  if (url.pathname.includes('/aw_gemini_messages/records')) {
    const messages = messagesFor(jobs[0])
    const detail = messages.find(item => url.pathname.endsWith(item.id))
    return route.fulfill({ json: detail || listing(messages.map(({ reply, inputText, ...metadata }) => metadata)) })
  }
  return route.fulfill({ json: listing([]) })
})

try {
  await page.goto(`${process.env.TEST_BASE_URL}/gemini`)
  await page.getByRole('heading', { name: '今天想聊些什么？' }).waitFor()
  await page.getByLabel('消息与提示词', { exact: true }).fill('直接问题')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '结束任务', exact: true }).waitFor()
  assert.equal(posts[0].prompt, '直接问题')
  assert.deepEqual(posts[0].sources, [])
  await page.getByRole('button', { name: '结束任务', exact: true }).click()
  await page.getByText('已取消', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '新对话', exact: true }).first().click()
  await page.waitForURL(url => !url.searchParams.has('job'))
  await page.getByRole('heading', { name: '今天想聊些什么？' }).waitFor()
  await page.getByRole('button', { name: '添加 Markdown', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '添加资料库文件' })
  await picker.getByRole('checkbox').check()
  await picker.getByRole('button', { name: '完成选择（1）' }).click()
  await page.getByLabel('消息与提示词', { exact: true }).fill('逐段整理，不要合并')
  await page.getByRole('button', { name: '消息配置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '消息配置', exact: true })
  await settings.getByLabel('并发数', { exact: true }).fill('3')
  await settings.getByLabel('系统提示词', { exact: true }).fill('准确保留公式')
  await settings.getByRole('button', { name: '保存配置', exact: true }).click()
  await settings.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '粘贴正文', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '补充正文', exact: true })
  await editor.getByLabel('任务名称（可选）').fill('讲义处理')
  await editor.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '预览分段', exact: true }).click()
  const preview = page.getByRole('dialog', { name: '分段预览', exact: true })
  await preview.getByText('原始正文', { exact: false }).waitFor()
  await preview.getByRole('button', { name: '关闭', exact: true }).click()
  loseOnce = true
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByText('提交响应丢失，请重试', { exact: true }).waitFor()
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('heading', { name: '讲义处理', exact: true }).waitFor()
  assert.equal(posts.at(-1).id, posts.at(-2).id)
  assert.equal(jobs.length, 2)
  assert.equal(posts.at(-1).systemPrompt, '准确保留公式')
  assert.equal(posts.at(-1).sources[0].content, content)
  Object.assign(jobs[0], { status: 'partial', completedChunks: 1, failedChunks: 1, updated: '2026-11-16T01:00:00Z' })
  await page.getByRole('button', { name: '刷新对话', exact: true }).click()
  await page.getByRole('heading', { name: '逐段保存的回复', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.unsafe), undefined)
  await page.getByRole('button', { name: '思考摘要', exact: true }).click()
  await page.getByText('公开的思考摘要', { exact: true }).waitFor()
  await page.getByRole('button', { name: '工具调用 · code_execution', exact: true }).click()
  await page.getByText('print(42)', { exact: false }).waitFor()
  await page.getByRole('button', { name: '工具结果 · code_execution', exact: true }).click()
  await page.getByRole('button', { name: '引用来源 · 1', exact: true }).click()
  assert.equal(await page.getByRole('link', { name: '参考资料' }).getAttribute('href'), 'https://example.com/source')
  await page.getByRole('button', { name: '94,123 Token · 明细', exact: true }).click()
  await page.getByText('40,000', { exact: true }).waitFor()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出响应', exact: true }).click()
  assert.equal((await download).suggestedFilename(), '讲义处理.json')
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme })
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} overflow ${width}`)
      const inputBox = await page.getByLabel('消息与提示词').boundingBox()
      assert.ok(inputBox && inputBox.y + inputBox.height <= 1000, 'composer remains visible')
      if (process.env.SCREENSHOT_DIR) {
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/assistant-ui-${theme}-${width}.png`, style: '[data-sonner-toaster] { visibility: hidden !important; }' })
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await selectOption(page.getByRole('combobox', { name: '选择分段' }), '222222222222222')
  await page.getByText('已保留的截断正文', { exact: true }).waitFor()
  await page.getByLabel('消息与提示词').fill('继续解释')
  await page.getByLabel('消息与提示词').press('Enter')
  await page.waitForURL(url => url.searchParams.get('job') === jobs[0].id && jobs.length === 3)
  assert.equal(posts.at(-1).parentMessage, '222222222222222')
  assert.equal(posts.at(-1).prompt, '继续解释')
  await page.reload()
  await page.getByRole('button', { name: '刷新对话' }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开对话历史' }).click()
  await page.getByRole('dialog', { name: '对话历史' }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: '新对话', exact: true }).click()
  await page.getByRole('heading', { name: '今天想聊些什么？' }).waitFor()
  assert.ok(wakes >= 3)
  assert.deepEqual(errors, [])
  console.log('assistant-ui: requests, durable follow-up, batching, recovery, reasoning, tools, sources, usage, exports and responsive history passed')
} catch (error) { console.error((await page.locator('body').innerText()).slice(-7000)); await mkdir('artifacts', {recursive:true}); await page.screenshot({path:'artifacts/browser-failure.png'}); throw error } finally { await browser.close() }
