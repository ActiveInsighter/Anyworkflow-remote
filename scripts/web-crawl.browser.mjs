import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const shots = process.env.SCREENSHOT_DIR
const errors = []
page.on('pageerror', error => errors.push(error.message))
const pbTime = ms => new Date(ms).toISOString().replace('T', ' ')
const now = Date.now()
const longUrl = `https://news.example.com/${'very-long-path-segment-'.repeat(8)}`

const target = (id, fields) => ({
  id, owner: 'owner-1', url: `https://example.com/${id}`, host: 'example.com', name: '', mode: 'auto', contentType: 'webpage', options: {},
  intervalMinutes: 1440, enabled: true, nextRunAt: pbTime(now + 3 * 3600_000), lastRunAt: '', lastRun: '', lastStatus: '', lastError: '',
  lastErrorCode: '', lastItemCount: 0, pageTitle: '', created: pbTime(now - 86400_000), updated: pbTime(now - 3600_000), ...fields,
})
const targets = [
  target('targetdone00001', { pageTitle: '行业新闻首页', lastStatus: 'succeeded', lastRunAt: pbTime(now - 600_000), lastItemCount: 1, contentType: '行业新闻' }),
  target('targetfail00001', { url: 'https://blocked.example.com/', host: 'blocked.example.com', lastStatus: 'failed', lastRunAt: pbTime(now - 1200_000), lastErrorCode: 'http_403', lastError: 'HTTP 403', intervalMinutes: 0, enabled: false, nextRunAt: '' }),
  target('targetbusy00001', { url: 'https://x.com/openai', host: 'x.com', mode: 'auto', contentType: 'social_media', options: { xScope: 'visible', maxPosts: 5 }, name: 'OpenAI 的帖子' }),
  target('targetlong00001', { url: longUrl, host: 'news.example.com', pageTitle: 'x'.repeat(140), enabled: false }),
]
const run = (id, fields) => ({
  id, owner: 'owner-1', targets: [], trigger: 'manual', items: [], results: {}, status: 'queued', cancelRequested: false, targetCount: 0,
  reportedCount: 0, succeededCount: 0, itemCount: 0, githubRunId: '', conclusion: '', dispatchStartedAt: '', startedAt: '', finishedAt: '',
  error: '', created: pbTime(now - 60_000), updated: pbTime(now - 30_000), ...fields,
})
const itemOf = row => ({ target: row.id, url: row.url, name: row.name, mode: row.mode, contentType: row.contentType, options: row.options })
const runs = [
  run('runactive000001', { status: 'running', trigger: 'schedule', targets: [targets[2].id], items: [itemOf(targets[2])], targetCount: 1, githubRunId: '987654321' }),
  run('runpartial00001', {
    status: 'partial', targets: [targets[0].id, targets[1].id], items: [itemOf(targets[0]), itemOf(targets[1])], targetCount: 2, reportedCount: 2,
    succeededCount: 1, itemCount: 1, githubRunId: '987654300', error: '1 个页面抓取失败', created: pbTime(now - 1200_000), finishedAt: pbTime(now - 1150_000),
    results: {
      [targets[0].id]: { status: 'succeeded', itemCount: 1, recordIds: ['content00000001'], title: '行业新闻首页', error: '', errorCode: '' },
      [targets[1].id]: { status: 'failed', itemCount: 0, recordIds: [], error: 'HTTP 403', errorCode: 'http_403' },
    },
  }),
]
const content = {
  id: 'content00000001', owner: 'owner-1', target: targets[0].id, run: 'runpartial00001', type: '行业新闻', platform: 'web', source: targets[0].url,
  canonicalUrl: 'https://example.com/news', externalId: '', title: '行业新闻首页', author: '编辑部', handle: '',
  content: `# 今日要闻\n\n<img src=x onerror="window.__crawled=1">\n\n${'很长的一行正文'.repeat(60)}`, publishedAt: '', fetchedAt: pbTime(now - 600_000),
  changedAt: pbTime(now - 600_000), created: pbTime(now - 86400_000), updated: pbTime(now - 600_000),
  media: { images: ['https://example.com/a.png', 'javascript:window.__crawled=1'] }, metrics: null, metadata: { format: 'markdown' },
}
const post = {
  ...content, id: 'content00000002', target: targets[2].id, type: 'social_media', platform: 'x', title: '', author: 'OpenAI', handle: '@OpenAI',
  content: '一条公开帖子\n第二行', canonicalUrl: 'https://x.com/OpenAI/status/1', metrics: { likes: 1200, replies: 30 }, metadata: {}, media: null,
}
const contents = [content, post]
const posted = { targets: [], runs: [] }, patched = [], canceled = [], deleted = []

await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
await context.route('https://pb.example.invalid/**', async route => {
  const req = route.request(), url = new URL(req.url())
  const filter = url.searchParams.get('filter') || ''
  const list = items => route.fulfill({ json: { items, page: 1, perPage: 50, totalPages: items.length ? 1 : 0, totalItems: items.length } })
  const cancel = /^\/api\/anyworkflow\/crawl\/runs\/([^/]+)\/cancel$/u.exec(url.pathname)
  if (cancel) {
    canceled.push(cancel[1])
    Object.assign(runs.find(row => row.id === cancel[1]), { cancelRequested: true })
    return route.fulfill({ json: { canceled: false, cancelRequested: true } })
  }

  const targetRecord = /^\/api\/collections\/aw_crawl_targets\/records(?:\/([^/]+))?$/u.exec(url.pathname)
  if (targetRecord && req.method() === 'POST') {
    const body = req.postDataJSON()
    posted.targets.push(body)
    const row = target(body.id, { ...body, host: new URL(body.url).hostname, contentType: body.contentType || 'webpage', created: pbTime(Date.now()) })
    targets.unshift(row)
    return route.fulfill({ json: row })
  }
  if (targetRecord && req.method() === 'PATCH') {
    const body = req.postDataJSON()
    patched.push({ id: targetRecord[1], body })
    const row = targets.find(item => item.id === targetRecord[1])
    Object.assign(row, body, { updated: pbTime(Date.now()) })
    return route.fulfill({ json: row })
  }
  if (targetRecord && req.method() === 'DELETE') {
    deleted.push(targetRecord[1])
    targets.splice(targets.findIndex(row => row.id === targetRecord[1]), 1)
    return route.fulfill({ status: 204 })
  }
  if (targetRecord?.[1]) return route.fulfill({ json: targets.find(row => row.id === targetRecord[1]) })
  if (targetRecord) return list(targets)

  const runRecord = /^\/api\/collections\/aw_crawl_runs\/records(?:\/([^/]+))?$/u.exec(url.pathname)
  if (runRecord && req.method() === 'POST') {
    const body = req.postDataJSON()
    posted.runs.push(body)
    const chosen = body.targets.map(id => targets.find(row => row.id === id))
    const row = run(body.id, { targets: body.targets, items: chosen.map(itemOf), targetCount: chosen.length, created: pbTime(Date.now()) })
    runs.unshift(row)
    return route.fulfill({ json: row })
  }
  if (runRecord?.[1]) return route.fulfill({ json: runs.find(row => row.id === runRecord[1]) })
  if (runRecord) {
    const active = ['queued', 'dispatching', 'pending', 'running']
    if (filter.includes('status="queued"')) return list(runs.filter(row => active.includes(row.status)))
    // Only the relation form matches on PocketBase; a bare `targets ?=` finds nothing there.
    const only = /targets\.id \?= "([^"]+)"/u.exec(filter)?.[1]
    return list(only ? runs.filter(row => row.targets.includes(only)) : runs)
  }

  const contentRecord = /^\/api\/collections\/aw_crawled_contents\/records(?:\/([^/]+))?$/u.exec(url.pathname)
  if (contentRecord?.[1]) return route.fulfill({ json: contents.find(row => row.id === contentRecord[1]) })
  if (contentRecord) {
    const only = /target="([^"]+)"/u.exec(filter)?.[1]
    const excerpt = row => ({ ...row, content: row.content.slice(0, 160), media: undefined, metadata: undefined, metrics: undefined })
    return list(contents.filter(row => !only || row.target === only).map(excerpt))
  }
  return list([])
})

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const row = text => page.locator('article').filter({ hasText: text })
const menuOf = record => record.getByRole('button', { name: /^更多操作/u })
const dialog = page.getByRole('dialog')
try {
  await page.goto(`${base}/web-crawl`)
  await page.getByRole('heading', { name: '网页抓取', exact: true }).waitFor()
  await row('行业新闻首页').getByText('每天 · 3 小时后').waitFor()
  await row('blocked.example.com').getByText('网站拒绝了匿名访问（403）').waitFor()
  await row('blocked.example.com').getByText('仅手动').waitFor()
  // A page in a running crawl says so and cannot be started twice.
  await row('OpenAI 的帖子').getByText('抓取中', { exact: true }).waitFor()
  assert.equal(await row('OpenAI 的帖子').getByRole('button', { name: '抓取', exact: true }).count(), 0)
  await row('行业新闻首页').getByRole('button', { name: '抓取', exact: true }).waitFor()
  await page.getByRole('link', { name: /网页抓取/u }).first().waitFor()

  // A link that cannot be read stops the batch and is named next to the field.
  const urls = page.getByLabel('页面链接')
  await urls.fill('https://example.com/a\nftp://example.com/b')
  await page.getByRole('button', { name: '添加页面', exact: true }).click()
  await page.getByText('无法识别：ftp://example.com/b').waitFor()
  assert.equal(posted.targets.length, 0)

  // Each link becomes a page with the batch's frequency and category; an X profile widens to visible posts.
  await urls.fill('example.com/a\nhttps://x.com/someone\nexample.com/a')
  await page.getByText('2 个链接', { exact: true }).waitFor()
  await page.getByLabel('抓取频率').selectOption('180')
  await page.getByRole('button', { name: '抓取选项', exact: true }).click()
  await page.getByLabel('内容选择器').fill('article')
  await page.getByRole('button', { name: /^抓取选项/u }).click()
  await page.getByLabel('已设置 1 项').waitFor()
  await page.getByRole('button', { name: '添加页面', exact: true }).click()
  await page.getByText('已添加 2 个页面，开始抓取').waitFor()
  assert.deepEqual(posted.targets.map(body => [body.url, body.intervalMinutes, body.enabled, body.options]), [
    ['https://example.com/a', 180, true, { selector: 'article' }],
    ['https://x.com/someone', 180, true, { selector: 'article', xScope: 'visible' }],
  ])
  assert.equal(posted.targets[0].owner, 'owner-1')
  // Crawl now: one run covering both new pages.
  assert.deepEqual(posted.runs.map(body => body.targets), [posted.targets.map(body => body.id)])
  assert.equal(await urls.inputValue(), '', 'an accepted batch clears the box')

  // Selecting pages turns the header into a bar; pages already crawling are left out of the new run.
  await page.getByRole('checkbox', { name: '选择本页全部页面' }).click()
  const bar = page.getByRole('toolbar', { name: '所选页面' })
  await bar.getByText(`已选 ${targets.length} 个`).waitFor()
  await bar.getByRole('button', { name: '抓取所选' }).click()
  await page.getByText(/^开始抓取 \d+ 个页面$/u).waitFor()
  const busy = new Set(runs.filter(item => item.status === 'queued' && item.id !== posted.runs.at(-1).id || item.status === 'running').flatMap(item => item.targets))
  assert.deepEqual(posted.runs.at(-1).targets.sort(), targets.map(item => item.id).filter(id => !busy.has(id)).sort())
  await bar.waitFor({ state: 'detached' })

  // Settings: only what changed is sent, so an untouched schedule keeps its next run.
  await menuOf(row('blocked.example.com')).click()
  await page.getByRole('menuitem', { name: '抓取设置' }).click()
  await dialog.getByRole('tab', { name: '设置', selected: true }).waitFor()
  await dialog.getByLabel('名称').fill('被拦截的站点')
  await dialog.getByLabel('抓取频率').selectOption('60')
  await dialog.getByRole('button', { name: '保存设置' }).click()
  await page.getByText('设置已保存').waitFor()
  assert.deepEqual(patched.at(-1), { id: 'targetfail00001', body: { name: '被拦截的站点', intervalMinutes: 60, enabled: true } })
  await dialog.getByRole('heading', { name: '被拦截的站点' }).waitFor()
  // Its history reads this page's own result in each run.
  await dialog.getByRole('tab', { name: '记录' }).click()
  await dialog.getByText('网站拒绝了匿名访问（403）').waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // Crawled content is untrusted: it stays text, images are links, and a script link is dropped.
  await page.getByRole('tab', { name: '内容', exact: true }).click()
  // The view switches in a transition after the URL; the category filter exists only in it.
  await page.getByRole('combobox', { name: '按分类筛选' }).waitFor()
  await row('OpenAI 的帖子').getByText('@OpenAI').waitFor()
  await row('行业新闻首页').getByRole('button', { name: '行业新闻首页', exact: true }).click()
  await dialog.getByRole('heading', { name: '今日要闻', exact: true }).waitFor()
  await dialog.getByText('onerror="window.__crawled=1"').waitFor()
  assert.equal(await dialog.locator('img').count(), 0)
  await dialog.getByRole('tab', { name: '信息', exact: true }).click()
  await dialog.getByText('编辑部').waitFor()
  await dialog.getByRole('link', { name: '图片 1', exact: true }).waitFor()
  assert.equal(await dialog.getByRole('link', { name: '图片 2' }).count(), 0)
  assert.equal(await page.evaluate(() => window.__crawled), undefined)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // History: cancel what is running, read what finished page by page.
  await page.getByRole('tab', { name: '记录', exact: true }).click()
  await page.getByText(/^\d+ 次抓取$/u).waitFor()
  const active = page.locator('article').filter({ has: page.getByRole('button', { name: '取消', exact: true }) }).filter({ hasText: '定时' })
  await active.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '取消中…' }).first().waitFor()
  assert.deepEqual(canceled, ['runactive000001'])
  const partial = row('1 个页面抓取失败')
  await partial.getByText('1/2 个页面成功 · 1 条内容').waitFor()
  await partial.getByRole('button', { name: '查看结果' }).click()
  await dialog.getByText('各页面结果').waitFor()
  await dialog.getByText('1 条内容', { exact: true }).waitFor()
  await dialog.getByText('网站拒绝了匿名访问（403）').waitFor()
  await dialog.getByRole('link', { name: '查看 GitHub 运行' }).waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // Desktop and phones are both first-class; nothing scrolls sideways at any width.
  await page.getByRole('tab', { name: '页面', exact: true }).click()
  await page.getByRole('checkbox', { name: '选择本页全部页面' }).waitFor()
  for (const width of [1440, 1024, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.getByLabel('页面链接').waitFor()
    assert.ok(await overflow() <= 0, `the page overflows at ${width}px`)
    if (shots) await page.screenshot({ path: `${shots}/crawl-targets-${width}.png`, fullPage: true })
    await row('行业新闻首页').getByRole('button', { name: '行业新闻首页', exact: true }).click()
    await dialog.getByRole('tab', { name: '内容', selected: true }).waitFor()
    await dialog.locator('article').first().waitFor()
    const box = await dialog.boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= width, `the page sheet leaves the screen at ${width}px`)
    const inner = await dialog.evaluate(node => [...node.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > node.getBoundingClientRect().right + 1).length)
    assert.equal(inner, 0, `the page sheet overflows at ${width}px`)
    if (shots) await page.screenshot({ path: `${shots}/crawl-sheet-${width}.png` })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
  }

  assert.deepEqual(errors, [])
  console.log('web crawl: composer, selection, settings, untrusted content, history and 320–1440px layouts ok')
} finally {
  await browser.close()
}
