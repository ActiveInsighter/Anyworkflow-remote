import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const shots = process.env.SCREENSHOT_DIR
const errors = []
page.on('pageerror', error => errors.push(error.message))
const now = new Date().toISOString()
const job = (id, fields) => ({
  id, owner: 'owner-1', url: `https://example.com/${id}`, host: 'example.com', options: {}, rerunOf: '', status: 'queued',
  cancelRequested: false, attempts: 0, nextAttemptAt: '', errorCode: '', error: '', startedAt: '', finishedAt: '', title: '',
  siteName: '', extractor: '', wordCount: 0, qualityScore: 0, created: now, updated: now, ...fields,
})
const longUrl = `https://example.com/${'very-long-path-segment-'.repeat(8)}`
const jobs = [
  job('jobdone00000001', { status: 'succeeded', title: '一篇写得很好的文章', wordCount: 1820, qualityScore: 86, extractor: 'site:weixin' }),
  job('jobpartial00001', { status: 'partial', title: 'x'.repeat(120), wordCount: 42, qualityScore: 18, extractor: 'defuddle:site', url: longUrl }),
  job('jobrunning00001', { status: 'rendering', url: longUrl }),
  job('jobqueued000001', { status: 'queued', attempts: 1, error: '页面没有响应' }),
  job('jobfailed000001', { status: 'failed', errorCode: 'CAPTCHA', error: '页面要求人工验证', url: 'https://example.com/wall' }),
]
const result = {
  id: 'result000000001', owner: 'owner-1', job: 'jobdone00000001', url: 'https://example.com/jobdone00000001', canonicalUrl: '',
  host: 'example.com', httpStatus: 200, title: '一篇写得很好的文章', byline: '作者甲', siteName: '示例站点', language: 'zh', description: '摘要',
  publishedAt: '2026-11-01 08:00:00.000Z', leadImage: '', markdown: `# 标题\n\n<img src=x onerror="window.__captured=1">\n\n${'很长的一行正文'.repeat(60)}`,
  html: '', contentHash: 'abc', wordCount: 1820, extractor: 'site:weixin', profile: 'weixin@1', qualityScore: 86, warnings: ['short_content'],
  links: [{ href: 'javascript:window.__captured=1', text: '危险链接' }, { href: 'https://example.com/next', text: '下一篇' }],
  images: [{ src: 'https://example.com/a.png', alt: '配图' }], structuredData: [], extras: {}, trace: {}, extensionVersion: '0.1.0', created: now, updated: now,
}
let workers = [{ id: 'worker000000001', owner: 'owner-1', workerId: 'w1', label: 'Chrome', version: '0.1.0', lastSeenAt: now, created: now, updated: now }]
const posted = [], canceled = [], deleted = []

await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
await context.route('https://pb.example.invalid/**', async route => {
  const req = route.request(), url = new URL(req.url())
  const list = items => route.fulfill({ json: { items, page: 1, perPage: 20, totalPages: 1, totalItems: items.length } })
  const cancel = /^\/api\/anyworkflow\/capture\/jobs\/([^/]+)\/cancel$/u.exec(url.pathname)
  if (cancel) {
    canceled.push(cancel[1])
    Object.assign(jobs.find(row => row.id === cancel[1]), { cancelRequested: true })
    return route.fulfill({ json: { ok: true } })
  }
  const record = /^\/api\/collections\/aw_capture_jobs\/records(?:\/([^/]+))?$/u.exec(url.pathname)
  if (record && req.method() === 'POST') {
    const body = req.postDataJSON()
    posted.push(body)
    const row = job(body.id, { ...body, host: new URL(body.url).hostname })
    jobs.unshift(row)
    return route.fulfill({ json: row })
  }
  if (record && req.method() === 'DELETE') {
    deleted.push(record[1])
    jobs.splice(jobs.findIndex(row => row.id === record[1]), 1)
    return route.fulfill({ status: 204 })
  }
  if (record?.[1]) return route.fulfill({ json: jobs.find(row => row.id === record[1]) })
  if (record) return list(jobs)
  if (url.pathname === '/api/collections/aw_capture_results/records') return list([result])
  if (url.pathname === '/api/collections/aw_capture_workers/records') return list(workers)
  return list([])
})

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const row = title => page.locator('article').filter({ hasText: title })
const menuOf = record => record.getByRole('button', { name: /^更多操作/u })
try {
  await page.goto(`${base}/page-capture`)
  await page.getByRole('heading', { name: '网页采集', exact: true }).waitFor()
  await page.getByText('扩展在线 · v0.1.0').waitFor()
  await row('一篇写得很好的文章').getByText('站点规则 · weixin').waitFor()
  await row('xxxxxxxx').getByText('通用解析 · 站点适配').waitFor()

  // A link that cannot be read stops the batch and is named next to the field.
  const urls = page.getByLabel('页面链接')
  await urls.fill('https://example.com/a\nftp://example.com/b')
  await page.getByRole('button', { name: '开始采集', exact: true }).click()
  await page.getByText('无法识别：ftp://example.com/b').waitFor()
  assert.equal(posted.length, 0)

  // Duplicates collapse, a bare domain gets https, and options travel with every link.
  await urls.fill('https://example.com/a\nhttps://example.com/a\nexample.com/b')
  await page.getByText('2 个链接', { exact: true }).waitFor()
  await page.getByRole('button', { name: '采集选项', exact: true }).click()
  await page.getByLabel('等待元素').fill('.article-body')
  await page.getByRole('switch', { name: '滚动加载' }).click()
  // Folding the options away keeps them: they are counted on the fold and still sent.
  await page.getByRole('button', { name: /^采集选项/u }).click()
  await page.getByLabel('已设置 2 项').waitFor()
  await page.getByRole('button', { name: '开始采集', exact: true }).click()
  await page.getByText('已提交 2 个采集任务').waitFor()
  assert.deepEqual(posted.map(body => body.url), ['https://example.com/a', 'https://example.com/b'])
  for (const body of posted) {
    assert.equal(body.owner, 'owner-1')
    assert.deepEqual(body.options, { waitFor: '.article-body', scroll: true })
  }
  assert.equal(await urls.inputValue(), '', 'an accepted batch clears the box')

  // Each state offers only the actions it allows: one up front, the rest in its menu.
  const running = row(longUrl)
  await running.getByRole('button', { name: '结束任务' }).waitFor()
  assert.equal(await running.getByRole('button', { name: '查看内容' }).count(), 0)
  await menuOf(running).click()
  await page.getByRole('menuitem', { name: '打开原页面' }).waitFor()
  assert.equal(await page.getByRole('menuitem', { name: '删除记录' }).count(), 0)
  await page.keyboard.press('Escape')
  await running.getByRole('button', { name: '结束任务' }).click()
  await page.getByRole('button', { name: '结束中…' }).first().waitFor()
  assert.deepEqual(canceled, ['jobrunning00001'])

  await row('页面要求人工验证').getByRole('button', { name: '重新采集' }).click()
  await page.getByText('已重新加入采集队列').waitFor()
  assert.equal(posted.at(-1).rerunOf, 'jobfailed000001')
  assert.equal(posted.at(-1).url, 'https://example.com/wall')

  await menuOf(row('页面要求人工验证')).click()
  await page.getByRole('menuitem', { name: '删除记录' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: /删除/u }).click()
  await page.getByText('页面要求人工验证').waitFor({ state: 'detached' })
  assert.deepEqual(deleted, ['jobfailed000001'])

  // Captured content is untrusted: it stays text, and a script link never becomes a link.
  await row('一篇写得很好的文章').getByRole('button', { name: '查看内容' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: '标题', exact: true }).waitFor()
  await dialog.getByText('onerror="window.__captured=1"').waitFor()
  assert.equal(await dialog.locator('img').count(), 0)
  await dialog.getByRole('tab', { name: 'Markdown', exact: true }).click()
  await dialog.getByText('# 标题').waitFor()
  await dialog.getByRole('tab', { name: '信息', exact: true }).click()
  await dialog.getByText('作者甲').waitFor()
  await dialog.getByText('正文较短').waitFor()
  await dialog.getByRole('tab', { name: '链接', exact: true }).click()
  await dialog.getByRole('link', { name: '下一篇', exact: true }).waitFor()
  assert.equal(await dialog.getByRole('link', { name: '危险链接' }).count(), 0)
  assert.equal(await page.evaluate(() => window.__captured), undefined)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // Desktop and phones are both first-class; nothing scrolls sideways at any width.
  for (const width of [1440, 1024, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.getByLabel('页面链接').waitFor()
    assert.ok(await overflow() <= 0, `the list overflows at ${width}px`)
    if (shots) await page.screenshot({ path: `${shots}/capture-list-${width}.png` })
    await row('一篇写得很好的文章').getByRole('button', { name: '查看内容' }).click()
    await dialog.getByRole('tab', { name: 'Markdown', exact: true }).waitFor()
    const box = await dialog.boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= width, `the result leaves the screen at ${width}px`)
    const inner = await dialog.evaluate(node => [...node.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > node.getBoundingClientRect().right + 1 && !child.closest('pre')).length)
    assert.equal(inner, 0, `the result overflows at ${width}px`)
    if (shots) await page.screenshot({ path: `${shots}/capture-result-${width}.png` })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })

  // With nobody to take the work, say so instead of leaving it queued in silence.
  workers = []
  await page.reload()
  await page.getByText('扩展离线').waitFor()
  await page.getByText('采集扩展不在线，任务会在扩展上线后开始。').waitFor()

  assert.deepEqual(errors, [])
  console.log('page capture: form, row actions, untrusted content and 320–1440px layouts ok')
} finally {
  await browser.close()
}
