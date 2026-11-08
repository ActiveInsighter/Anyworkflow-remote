import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// Web crawling, one page for both runners: submit links to the cloud or the browser, save pages on a
// schedule, follow and steer jobs, read documents as untrusted text, at 320–1440px in both themes.
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const shots = process.env.SCREENSHOT_DIR
if (shots) await mkdir(shots, { recursive: true })
const errors = []
const pbTime = (ms) => new Date(ms).toISOString().replace('T', ' ')
const now = Date.now()
const longUrl = `https://news.example.com/${'very-long-path-segment-'.repeat(8)}`

const target = (id, fields) => ({
  id, owner: 'owner-1', url: `https://example.com/${id}`, host: 'example.com', name: '', runner: 'cloud', category: 'webpage', options: {},
  intervalMinutes: 1440, enabled: true, nextRunAt: pbTime(now + 3 * 3600_000), lastJob: '', lastRunAt: '', lastStatus: '', lastErrorCode: '',
  lastError: '', lastDocument: '', title: '', created: pbTime(now - 86400_000), updated: pbTime(now - 3600_000), ...fields,
})
const targets = [
  target('targetdone00001', { title: '行业新闻首页', lastStatus: 'succeeded', lastRunAt: pbTime(now - 600_000), lastDocument: 'document0000001', category: '行业新闻' }),
  target('targetfail00001', { url: 'https://blocked.example.com/', host: 'blocked.example.com', lastStatus: 'failed', lastRunAt: pbTime(now - 1200_000), lastErrorCode: 'ACCESS_DENIED', lastError: 'Access denied', intervalMinutes: 0, enabled: false, nextRunAt: '' }),
  target('targetbusy00001', { url: 'https://x.com/openai', host: 'x.com', runner: 'browser', category: 'social_media', options: { scope: 'visible', maxItems: 5 }, name: 'OpenAI 的帖子' }),
  target('targetlong00001', { url: longUrl, host: 'news.example.com', title: 'x'.repeat(140), enabled: false }),
]
const job = (id, fields) => ({
  id, owner: 'owner-1', target: '', url: 'https://example.com/a', host: 'example.com', runner: 'cloud', category: 'webpage', options: {}, trigger: 'manual',
  rerunOf: '', status: 'queued', cancelRequested: false, attempts: 0, nextAttemptAt: '', errorCode: '', error: '', startedAt: '', finishedAt: '', title: '',
  siteName: '', extractor: '', profile: '', wordCount: 0, qualityScore: 0, itemCount: 0, document: '', changed: false,
  created: pbTime(now - 60_000), updated: pbTime(now - 30_000), ...fields,
})
const jobs = [
  job('jobrunning00001', { target: 'targetbusy00001', url: targets[2].url, host: 'x.com', runner: 'browser', category: 'social_media', status: 'rendering', trigger: 'schedule' }),
  job('jobdone00000001', { target: 'targetdone00001', url: targets[0].url, title: '行业新闻首页', status: 'succeeded', wordCount: 1820, extractor: 'defuddle', document: 'document0000001', changed: true, created: pbTime(now - 600_000) }),
  job('jobwall00000001', { url: 'https://social.example.com/feed', host: 'social.example.com', status: 'failed', errorCode: 'LOGIN_REQUIRED', error: 'Login required', created: pbTime(now - 900_000) }),
  job('jobretry0000001', { url: 'https://slow.example.com/', host: 'slow.example.com', status: 'queued', attempts: 1, errorCode: 'TIMEOUT', error: 'Timed out', created: pbTime(now - 120_000) }),
]
const document = {
  id: 'document0000001', owner: 'owner-1', identity: '', target: 'targetdone00001', job: 'jobdone00000001', runner: 'cloud', category: '行业新闻',
  url: targets[0].url, canonicalUrl: 'https://example.com/news', host: 'example.com', httpStatus: 200, title: '行业新闻首页', byline: '编辑部', siteName: '示例新闻',
  language: 'zh', description: '', publishedAt: '', leadImage: '', wordCount: 1820,
  markdown: `# 今日要闻\n\n<img src=x onerror="window.__crawled=1">\n\n${'很长的一行正文'.repeat(60)}`, html: '', items: [],
  links: [{ href: 'https://example.com/more', text: '更多' }, { href: 'javascript:window.__crawled=1', text: '脚本链接' }], images: [], structuredData: [], extras: {},
  extractor: 'defuddle', profile: '', qualityScore: 86, warnings: ['route_fell_back'], trace: { route: 'browser', runner: 'cloud' }, crawlerVersion: '0.2.0',
  contentHash: 'a'.repeat(64), fetchedAt: pbTime(now - 600_000), changedAt: pbTime(now - 600_000), created: pbTime(now - 86400_000), updated: pbTime(now - 600_000),
}
const post = {
  ...document, id: 'document0000002', identity: 'x:status:1', target: 'targetbusy00001', job: '', runner: 'browser', category: 'social_media', url: 'https://x.com/OpenAI/status/1',
  canonicalUrl: 'https://x.com/OpenAI/status/1', host: 'x.com', title: 'OpenAI：一条公开帖子', byline: 'OpenAI', siteName: 'X', profile: 'x', extractor: 'site:x', warnings: [],
  markdown: '## OpenAI @OpenAI\n\n一条公开帖子', links: [],
  items: [
    { id: '1', url: 'https://x.com/OpenAI/status/1', author: 'OpenAI', handle: '@OpenAI', text: '一条公开帖子\n第二行', postedAt: '2026-11-07T08:00:00.000Z', metrics: { likes: 1200, replies: 30 }, relation: 'target', images: ['javascript:alert(1)', 'https://pbs.example.com/1.jpg'] },
    { id: '2', url: 'https://x.com/OpenAI/status/2', author: 'OpenAI', handle: '@OpenAI', text: '另一条', postedAt: '2026-11-06T08:00:00.000Z', relation: 'visible' },
  ],
}
const documents = [document, post]
const workers = [{ id: 'worker000000001', owner: 'owner-1', workerId: 'w1', label: 'Chrome', version: '0.2.0', lastSeenAt: pbTime(now - 30_000) }]
const posted = { targets: [], jobs: [] }, patched = [], canceled = []
const active = ['queued', 'opening', 'rendering', 'extracting', 'uploading']

async function open({ width = 1440, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme })
  await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
  await context.route('https://pb.example.invalid/**', async (route) => {
    const req = route.request(), url = new URL(req.url())
    const filter = url.searchParams.get('filter') || ''
    const list = (items) => route.fulfill({ json: { items, page: 1, perPage: 50, totalPages: items.length ? 1 : 0, totalItems: items.length } })

    const cancel = /^\/api\/anyworkflow\/crawl\/jobs\/([^/]+)\/cancel$/u.exec(url.pathname)
    if (cancel) {
      canceled.push(cancel[1])
      Object.assign(jobs.find((row) => row.id === cancel[1]), { cancelRequested: true })
      return route.fulfill({ json: { canceled: false, cancelRequested: true } })
    }

    const targetRecord = /^\/api\/collections\/aw_crawl_targets\/records(?:\/([^/]+))?$/u.exec(url.pathname)
    if (targetRecord && req.method() === 'POST') {
      const body = req.postDataJSON()
      posted.targets.push(body)
      const row = target(body.id, { ...body, host: new URL(body.url).hostname, category: body.category || 'webpage', created: pbTime(Date.now()) })
      targets.unshift(row)
      return route.fulfill({ json: row })
    }
    if (targetRecord && req.method() === 'PATCH') {
      const body = req.postDataJSON()
      patched.push({ id: targetRecord[1], body })
      const row = targets.find((item) => item.id === targetRecord[1])
      Object.assign(row, body, { updated: pbTime(Date.now()) })
      return route.fulfill({ json: row })
    }
    if (targetRecord?.[1]) return route.fulfill({ json: targets.find((row) => row.id === targetRecord[1]) })
    if (targetRecord) return list(targets)

    const jobRecord = /^\/api\/collections\/aw_crawl_jobs\/records(?:\/([^/]+))?$/u.exec(url.pathname)
    if (jobRecord && req.method() === 'POST') {
      const body = req.postDataJSON()
      posted.jobs.push(body)
      const from = body.target ? targets.find((row) => row.id === body.target) : null
      const row = job(body.id, { ...body, ...(from ? { url: from.url, runner: from.runner, category: from.category } : {}), host: new URL(from?.url ?? body.url).hostname, created: pbTime(Date.now()) })
      jobs.unshift(row)
      return route.fulfill({ json: row })
    }
    if (jobRecord?.[1]) return route.fulfill({ json: jobs.find((row) => row.id === jobRecord[1]) })
    if (jobRecord) {
      const only = /target="([^"]+)"/u.exec(filter)?.[1]
      if (filter.includes('status="queued"')) return list(jobs.filter((row) => active.includes(row.status)))
      return list(jobs.filter((row) => !only || row.target === only))
    }

    const documentRecord = /^\/api\/collections\/aw_crawl_documents\/records(?:\/([^/]+))?$/u.exec(url.pathname)
    if (documentRecord?.[1]) return route.fulfill({ json: documents.find((row) => row.id === documentRecord[1]) })
    if (documentRecord) {
      const only = /target="([^"]+)"/u.exec(filter)?.[1]
      const excerpt = (row) => ({ ...row, markdown: row.markdown.slice(0, 160), items: undefined, links: undefined, html: undefined })
      return list(documents.filter((row) => !only || row.target === only).map(excerpt))
    }
    if (url.pathname === '/api/collections/aw_crawl_workers/records') return list(workers)
    return list([])
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  return { context, page }
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

try {
  const { context, page } = await open()
  const row = (text) => page.locator('article').filter({ hasText: text })
  const menuOf = (record) => record.getByRole('button', { name: /^更多操作/u })
  const dialog = page.getByRole('dialog')

  // The old pages lead here.
  await page.goto(`${base}/page-capture`)
  await page.waitForURL((url) => url.pathname === '/crawl')
  await page.getByRole('heading', { name: '网页采集', exact: true }).waitFor()
  await page.getByText('扩展在线 · v0.2.0').waitFor()
  await page.getByRole('link', { name: /网页采集/u }).first().waitFor()

  // Jobs first: each row offers what its state puts first.
  await row('行业新闻首页').getByRole('button', { name: '查看内容' }).waitFor()
  await row('social.example.com').getByText('页面需要登录，可以改用浏览器抓取').waitFor()
  await row('slow.example.com').getByText('第 1 次没有成功，稍后自动重试：抓取超时').waitFor()
  const running = row('x.com/openai')
  await running.getByText('等待渲染').waitFor()
  await running.getByRole('button', { name: '取消', exact: true }).click()
  await running.getByRole('button', { name: '取消中…' }).waitFor()
  assert.deepEqual(canceled, ['jobrunning00001'])

  // A cloud crawl stopped by a login moves to the signed-in browser in one step.
  await row('social.example.com').getByRole('button', { name: '用浏览器抓取' }).click()
  await page.getByText('已改用浏览器抓取').waitFor()
  assert.deepEqual(posted.jobs.at(-1), { owner: 'owner-1', url: 'https://social.example.com/feed', runner: 'browser', category: 'webpage', options: {}, rerunOf: 'jobwall00000001', id: posted.jobs.at(-1).id })

  // A link that cannot be read stops the batch and is named next to the field.
  const urls = page.getByLabel('页面链接')
  await urls.fill('https://example.com/a\nftp://example.com/b')
  await page.getByRole('button', { name: '开始抓取', exact: true }).click()
  await page.getByText('无法识别：ftp://example.com/b').waitFor()
  const before = posted.jobs.length

  // One crawl per link, with the batch's runner and options; an X profile reads its visible posts.
  await urls.fill('example.com/a\nhttps://x.com/someone\nexample.com/a')
  await page.getByText('2 个链接', { exact: true }).waitFor()
  await page.getByRole('button', { name: '采集选项', exact: true }).click()
  await page.getByLabel('正文选择器').fill('article')
  await page.getByLabel('云端读取方式').selectOption('browser')
  await page.getByLabel('已设置 2 项').waitFor()
  await page.getByRole('button', { name: '开始抓取', exact: true }).click()
  await page.getByText('已提交 2 个抓取').waitFor()
  assert.deepEqual(posted.jobs.slice(before).map((body) => [body.url, body.runner, body.options]), [
    ['https://example.com/a', 'cloud', { contentSelector: 'article', transport: 'browser' }],
    ['https://x.com/someone', 'cloud', { contentSelector: 'article', scope: 'visible', transport: 'browser' }],
  ])
  assert.equal(await urls.inputValue(), '', 'an accepted batch clears the box')

  // Sites that usually want a login suggest the browser; there the cloud read mode goes away.
  await urls.fill('https://www.zhihu.com/question/1')
  await page.getByText('zhihu.com 通常需要登录才能看到完整内容。').waitFor()
  await page.getByRole('button', { name: '改用浏览器' }).click()
  await page.getByRole('radio', { name: '浏览器', checked: true }).waitFor()
  assert.equal(await page.getByLabel('云端读取方式').count(), 0)
  await page.getByText('在你的浏览器里打开，使用它已登录的账号。').waitFor()

  // Saved as a page: a schedule, then its first crawl through the page; the view follows.
  await page.getByRole('switch', { name: '保存为页面' }).click()
  await page.getByLabel('抓取频率').selectOption('180')
  await page.getByRole('button', { name: '保存并抓取', exact: true }).click()
  await page.getByText('已保存 1 个页面，开始抓取').waitFor()
  assert.deepEqual(posted.targets.map((body) => [body.url, body.runner, body.intervalMinutes, body.enabled, body.options]), [
    ['https://www.zhihu.com/question/1', 'browser', 180, true, { contentSelector: 'article' }],
  ])
  assert.deepEqual(posted.jobs.at(-1), { owner: 'owner-1', target: posted.targets[0].id, id: posted.jobs.at(-1).id })
  await page.waitForURL((url) => url.searchParams.get('tab') === 'targets')

  // Pages: the schedule and last outcome; a page already crawling has nothing to start.
  await row('行业新闻首页').getByText('每天 · 3 小时后').waitFor()
  await row('blocked.example.com').getByText('网站拒绝了访问').waitFor()
  await row('blocked.example.com').getByText('仅手动').waitFor()
  assert.equal(await row('OpenAI 的帖子').getByRole('button', { name: '抓取', exact: true }).count(), 0)
  const selection = posted.jobs.length
  await page.getByRole('checkbox', { name: '选择本页全部页面' }).click()
  const bar = page.getByRole('toolbar', { name: '所选页面' })
  await bar.getByText(`已选 ${targets.length} 个`).waitFor()
  await bar.getByRole('button', { name: '抓取所选' }).click()
  await page.getByText(/^开始抓取 \d+ 个页面$/u).waitFor()
  const busy = new Set(jobs.slice(posted.jobs.length - selection).filter((item) => active.includes(item.status) && item.target).map((item) => item.target))
  assert.ok(posted.jobs.slice(selection).every((body) => body.target && !busy.has(body.target)), 'pages already crawling are skipped')
  assert.ok(!posted.jobs.slice(selection).some((body) => body.target === 'targetbusy00001'))
  await bar.waitFor({ state: 'detached' })

  // Settings: only what changed is sent, so an untouched schedule keeps its next run.
  await menuOf(row('blocked.example.com')).click()
  await page.getByRole('menuitem', { name: '抓取设置' }).click()
  await dialog.getByRole('tab', { name: '设置', selected: true }).waitFor()
  await dialog.getByLabel('名称').fill('被拦截的站点')
  await dialog.getByLabel('抓取频率').selectOption('60')
  await dialog.getByRole('radio', { name: '浏览器' }).click()
  await dialog.getByRole('button', { name: '保存设置' }).click()
  await page.getByText('设置已保存').waitFor()
  assert.deepEqual(patched.at(-1), { id: 'targetfail00001', body: { name: '被拦截的站点', runner: 'browser', intervalMinutes: 60, enabled: true, options: {} } })
  await dialog.getByRole('heading', { name: '被拦截的站点' }).waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // Documents are untrusted: they stay text, links are filtered, nothing of theirs loads.
  await page.getByRole('tab', { name: '内容', exact: true }).click()
  await page.getByRole('combobox', { name: '按分类筛选' }).waitFor()
  await row('OpenAI：一条公开帖子').getByText('浏览器').waitFor()
  await row('行业新闻首页').getByRole('button', { name: '行业新闻首页', exact: true }).click()
  await dialog.getByRole('heading', { name: '今日要闻', exact: true }).waitFor()
  await dialog.getByText('onerror="window.__crawled=1"').waitFor()
  assert.equal(await dialog.locator('img').count(), 0)
  await dialog.getByRole('tab', { name: '信息', exact: true }).click()
  await dialog.getByText('编辑部').waitFor()
  await dialog.getByText('静态读取没有内容，已改用浏览器').waitFor()
  await dialog.getByText('浏览器渲染').waitFor()
  await dialog.getByRole('tab', { name: '链接', exact: true }).click()
  await dialog.getByRole('link', { name: '更多' }).waitFor()
  assert.equal(await dialog.getByRole('link', { name: '脚本链接' }).count(), 0)
  assert.equal(await page.evaluate(() => window.__crawled), undefined)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // Posts open on their entries: who, when, the text with its line breaks, and numbers.
  await row('OpenAI：一条公开帖子').getByRole('button', { name: 'OpenAI：一条公开帖子', exact: true }).click()
  await dialog.getByRole('tab', { name: '条目 2', selected: true }).waitFor()
  await dialog.getByText('链接指向').waitFor()
  await dialog.getByText('喜欢 1,200').waitFor()
  assert.equal(await dialog.getByRole('link', { name: '图片 1' }).getAttribute('href'), 'https://pbs.example.com/1.jpg')
  assert.equal(await dialog.getByRole('link', { name: '图片 2' }).count(), 0)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  await context.close()

  // Desktop and phones in both themes; nothing scrolls sideways at any width.
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [1440, 1024, 760, 390, 320]) {
      const view = await open({ width, colorScheme })
      for (const tab of ['', 'documents', 'targets']) {
        await view.page.goto(`${base}/crawl${tab ? `?tab=${tab}` : ''}`)
        await view.page.getByLabel('页面链接').waitFor()
        await view.page.locator('article').first().waitFor()
        assert.ok(await overflow(view.page) <= 0, `/crawl ${tab || 'jobs'} overflows at ${width}px`)
        if (shots && [1440, 390, 320].includes(width)) await view.page.screenshot({ path: `${shots}/crawl-${tab || 'jobs'}-${width}-${colorScheme}.png`, fullPage: true })
      }
      await view.page.locator('article').filter({ hasText: '行业新闻首页' }).getByRole('button', { name: '行业新闻首页', exact: true }).click()
      const sheet = view.page.getByRole('dialog')
      await sheet.getByRole('tab', { name: '内容', selected: true }).waitFor()
      await sheet.locator('article').first().waitFor()
      const box = await sheet.boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= width, `the page sheet leaves the screen at ${width}px`)
      const inner = await sheet.evaluate((node) => [...node.querySelectorAll('*')].filter((child) => child.getBoundingClientRect().right > node.getBoundingClientRect().right + 1).length)
      assert.equal(inner, 0, `the page sheet overflows at ${width}px`)
      if (shots && [1440, 390].includes(width)) await view.page.screenshot({ path: `${shots}/crawl-sheet-${width}-${colorScheme}.png` })
      await view.context.close()
    }
  }

  assert.deepEqual(errors, [])
  console.log('crawl: one page for cloud and browser — composer, runners, saved pages, settings, job actions, untrusted documents and 320–1440px in both themes ok')
} finally {
  await browser.close()
}
