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
let jobs = [], posts = [], loseOnce = false, wakes = 0
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
await context.route('https://pb.example.invalid/**', route => {
  const request = route.request(), url = new URL(request.url()), body = request.method() === 'POST' ? request.postDataJSON() : null
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
  if (url.pathname.includes('/aw_gemini_jobs/records/')) return route.fulfill({ json: jobs.find(job => url.pathname.endsWith(job.id)) })
  if (url.pathname.includes('/aw_gemini_jobs/records')) return route.fulfill({ json: listing(jobs) })
  if (url.pathname.includes('/aw_gemini_messages/records')) {
    const messages = [1, 2].map(index => ({ id: String(index).repeat(15), owner: 'owner-1', job: jobs[0].id, index, part: index, sourceName: file.fileName, status: index === 1 ? 'succeeded' : 'failed', reply: index === 1 ? '# 逐段保存的回复\n<script>window.unsafe = true</script>' : '已保留的截断正文', inputText: index === 1 ? '# 第一节\n原始正文' : '# 第二节', error: index === 2 ? '回复达到输出上限' : '', finishReason: index === 2 ? 'MAX_TOKENS' : 'STOP', usage: { totalTokenCount: 123 } }))
    const detail = messages.find(item => url.pathname.endsWith(item.id))
    return route.fulfill({ json: detail || listing(messages.map(({ reply, inputText, ...metadata }) => metadata)) })
  }
  return route.fulfill({ json: listing([]) })
})

try {
  await page.goto(`${process.env.TEST_BASE_URL}/gemini`)
  await page.getByText('还没有消息记录', { exact: true }).waitFor()
  await page.getByLabel('消息与提示词', { exact: true }).fill('直接问题')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '结束任务', exact: true }).waitFor()
  assert.deepEqual(posts[0].sources, [])
  assert.equal(posts[0].prompt, '直接问题')
  await page.getByRole('button', { name: '结束任务', exact: true }).click()
  await page.getByText('已取消', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '添加 Markdown', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '添加资料库文件' })
  await picker.getByRole('checkbox').check()
  for (const width of [320, 760, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `picker overflow ${width}`)
  }
  await picker.getByRole('button', { name: '完成选择（1）' }).click()
  await page.getByLabel('消息与提示词', { exact: true }).fill('逐段整理，不要合并')
  await page.getByLabel('并发数', { exact: true }).fill('3')
  await page.getByRole('button', { name: '正文与模型设置' }).click()
  await page.getByLabel('系统提示词', { exact: true }).fill('准确保留公式')
  await page.getByLabel('任务名称', { exact: true }).fill('讲义处理')
  await page.getByRole('button', { name: '预览分段', exact: true }).click()
  await page.getByText('将发送 2 段', { exact: true }).waitFor()
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.getByRole('heading', { name: 'Gemini 消息', exact: true }).scrollIntoViewIfNeeded()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} overflow ${width}`)
      if (process.env.SCREENSHOT_DIR) {
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gemini-${theme}-${width}.png`, fullPage: true })
      }
    }
  }
  loseOnce = true
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByText('提交响应丢失，请重试', { exact: true }).waitFor()
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '讲义处理', exact: true }).waitFor()
  assert.equal(posts.at(-1).id, posts.at(-2).id, 'a lost create response reuses the task id')
  assert.equal(jobs.length, 2)
  assert.equal(posts.at(-1).systemPrompt, '准确保留公式')
  assert.equal(posts.at(-1).sources[0].content, content)
  assert.equal(posts.at(-1).concurrency, 3)
  Object.assign(jobs[0], { status: 'partial', completedChunks: 1, failedChunks: 1 })
  await page.getByRole('button', { name: '刷新消息记录' }).click()
  await page.getByRole('button', { name: '讲义处理', exact: true }).click()
  const details = page.getByRole('dialog', { name: 'Gemini 回复', exact: true })
  await details.getByRole('button', { name: /第 1 段/ }).click()
  await details.getByRole('heading', { name: '逐段保存的回复', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.unsafe), undefined)
  await details.getByRole('button', { name: '查看原始正文' }).click()
  await details.getByText('# 第一节\n原始正文', { exact: true }).waitFor()
  await details.getByRole('button', { name: /第 2 段/ }).click()
  await details.getByText('已保留的截断正文', { exact: true }).waitFor()
  for (const width of [320, 760, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `reply overflow ${width}`)
  }
  assert.ok(wakes >= 3)
  await page.goto(`${process.env.TEST_BASE_URL}/gemini?file=${fileId}`)
  await page.getByRole('button', { name: `移除 ${file.fileName}`, exact: true }).waitFor()
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/gemini' && !url.searchParams.has('file'))
  assert.deepEqual(errors, [])
  console.log('gemini: direct text, MD selection/preview, model options, idempotent submission, cancel, partial replies, safe rendering and responsive themes passed')
} finally { await browser.close() }
