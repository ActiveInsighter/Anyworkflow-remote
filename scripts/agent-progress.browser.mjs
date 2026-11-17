import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
const page = await context.newPage(), errors = [], cursors = []
page.on('pageerror', error => errors.push(error.message))
let stage = 1, outage = false, legacy = false
const job = { id: 'aaaaaaaaaaaaaaa', owner: 'owner-1', title: '实时 Agent 验证', model: 'Antigravity', prompt: '检查项目并运行测试', totalChunks: 1, completedChunks: 0, failedChunks: 0, status: 'running', options: { agent: { model: 'gemini-4-hydrogen' } }, created: '2026-11-17T00:00:00Z' }
const message = () => ({ id: 'bbbbbbbbbbbbbbb', owner: job.owner, job: job.id, index: 1, part: 1, inputText: 'project', sourceName: '', status: stage === 3 ? 'succeeded' : 'running', reply: stage === 3 ? '# 最终结果\n测试全部通过' : '', usage: {}, ...(legacy ? {} : { streamRevision: stage }) })
const part = (key, sequence, type, content, revision = sequence) => ({ id: key, owner: job.owner, message: 'bbbbbbbbbbbbbbb', key, sequence, revision, type, content, toolName: type.startsWith('tool') ? 'terminal' : '', callId: 'call-1', status: 'completed', truncated: false, created: '2026-11-17T00:00:00Z', updated: '2026-11-17T00:01:00Z' })
const listing = items => ({ page: 1, perPage: 20, totalItems: items.length, totalPages: 1, items })
await context.route('https://pb.example.invalid/**', route => {
  const url = new URL(route.request().url())
  if (url.pathname.endsWith('/parts')) {
    if (outage) return route.fulfill({ status: 503, json: { message: '进度暂时不可用' } })
    const cursor = Number(url.searchParams.get('after')); cursors.push(cursor)
    const parts = [part('think', 1, 'reasoning_summary', '先检查仓库结构'), part('call', 2, 'tool_call', JSON.stringify({ command: 'npm test', url: 'https://example.invalid/' + 'x'.repeat(800) }))]
    if (stage >= 2) parts.push(part('result', 3, 'tool_result', '<script>window.unsafe = true</script>\n测试通过'))
    if (stage === 3) parts.push(part('text', 4, 'text', '测试全部通过'))
    const items = parts.filter(p => p.revision > cursor)
    return route.fulfill({ json: { items, nextCursor: items.at(-1)?.revision ?? cursor, hasMore: false, revision: parts.length, status: message().status, progressAt: '2026-11-17T00:01:00Z', usage: { totalTokenCount: stage * 100, promptTokenCount: 80, cachedContentTokenCount: 0, toolUseTokenCount: stage * 10 } } })
  }
  if (url.pathname.endsWith('/messages/bbbbbbbbbbbbbbb')) return route.fulfill({ json: message() })
  if (url.pathname.endsWith('/gemini/jobs/aaaaaaaaaaaaaaa')) return route.fulfill({ json: { job: { ...job, status: message().status }, messages: [{ ...message(), updated: String(stage) }] } })
  if (url.pathname.endsWith('/gemini/config')) return route.fulfill({ json: { owner: job.owner, revision: 0, config: { model: job.model, delimiter: '<!-- aw:split -->', concurrency: 1, thinkingLevel: '', maxOutputTokens: 8192, rpmPerKey: 15, rpdPerKey: 500 } } })
  if (url.pathname.includes('/aw_gemini_jobs/records')) return route.fulfill({ json: listing([job]) })
  if (url.pathname.endsWith('/models/saved')) return route.fulfill({ json: [] })
  return route.fulfill({ json: listing([]) })
})
try {
  await page.goto(`${process.env.TEST_BASE_URL}/gemini?job=${job.id}`)
  const dialog = page.getByRole('dialog', { name: job.title, exact: true })
  await dialog.getByRole('button', { name: /思考摘要/ }).click()
  await dialog.getByText('先检查仓库结构', { exact: true }).last().waitFor()
  await dialog.getByRole('button', { name: /工具调用/ }).click()
  await dialog.getByText(/"command":"npm test"/).waitFor()
  await dialog.getByText('100 Token · 明细', { exact: true }).click()
  await dialog.getByText('缓存 0', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('heading', { name: '最终结果' }).count(), 0)
  stage = 2
  await dialog.getByRole('button', { name: /工具结果/ }).waitFor()
  assert.ok(cursors.includes(2), 'reads only changed parts after initial cursor')
  await dialog.getByRole('button', { name: /工具结果/ }).click()
  await dialog.getByText(/<script>/).waitFor()
  assert.equal(await page.evaluate(() => window.unsafe), undefined)
  assert.equal(await dialog.getByRole('button', { name: /工具调用/ }).count(), 1, 'incremental update never duplicates tools')
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme })
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${theme}/${width}`)
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), `dialog overflow ${theme}/${width}`)
      if (process.env.SCREENSHOT_DIR) {
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/agent-${theme}-${width}.png` })
      }
    }
  }
  outage = true
  await dialog.getByRole('button', { name: '重新加载进度' }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: /工具调用/ }).count(), 1, 'keeps saved progress during outage')
  outage = false; stage = 3
  await dialog.getByRole('button', { name: '重新加载进度' }).click()
  await dialog.getByText('300 Token · 明细', { exact: true }).waitFor()
  await dialog.getByRole('heading', { name: '最终结果' }).waitFor()
  await page.reload()
  await dialog.getByRole('button', { name: /工具结果/ }).waitFor()
  await dialog.getByRole('heading', { name: '最终结果' }).waitFor()
  legacy = true
  await page.reload()
  await dialog.getByRole('heading', { name: '最终结果' }).waitFor()
  assert.deepEqual(errors, [])
  console.log('agent-progress: live typed parts, cursor updates, usage, failure/retry, reload, legacy chat and responsive themes passed')
} finally { await browser.close() }
