import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const api = await server.ssrLoadModule('/src/lib/api/crawl.ts')
  const display = await server.ssrLoadModule('/src/features/crawl/lib/crawl-display.ts')
  const drafts = await server.ssrLoadModule('/src/features/crawl/lib/option-draft.ts')
  const { crawlJobKind, taskStatusMeta, taskPhase } = await server.ssrLoadModule('/src/lib/tasks/index.ts')
  setSession({ token: 'fixture-token', record: { id: 'owner' }, baseUrl: 'https://pb.example.invalid' })

  // Options: only what was set, and only what the runner reads.
  const all = { waitFor: ' .a ', contentSelector: '', removeSelectors: [' .ad ', ''], scroll: true, keepHtml: false, timeoutSeconds: 30, scope: 'target', maxItems: 5, transport: 'http' }
  assert.deepEqual(api.compactCrawlOptions(all, 'cloud'), { waitFor: '.a', removeSelectors: ['.ad'], scroll: true, timeoutSeconds: 30, scope: 'target', transport: 'http' })
  assert.deepEqual(api.compactCrawlOptions(all, 'browser'), { waitFor: '.a', removeSelectors: ['.ad'], scroll: true, timeoutSeconds: 30, scope: 'target' }, 'the browser has no cloud transport')
  assert.deepEqual(api.compactCrawlOptions({ scope: 'visible', maxItems: 5 }, 'cloud'), { scope: 'visible', maxItems: 5 })
  // An X profile names no single post, so it reads the visible ones; a status link does not.
  assert.deepEqual(api.optionsForUrl('https://x.com/openai', {}, 'cloud'), { scope: 'visible' })
  assert.deepEqual(api.optionsForUrl('https://x.com/openai', { scope: 'target', maxItems: 3 }, 'cloud'), { scope: 'visible' })
  assert.deepEqual(api.optionsForUrl('https://x.com/openai/status/1', {}, 'cloud'), {})
  assert.deepEqual(api.optionsForUrl('https://example.com/', {}, 'cloud'), {})
  assert.equal(api.isXStatusUrl('https://x.com/i/web/status/123'), true)
  assert.equal(api.isXStatusUrl('https://example.com/a/status/123'), false)
  assert.equal(api.defaultCategory('https://twitter.com/a'), 'social_media')
  assert.equal(api.defaultCategory('https://example.com/'), 'webpage')

  // Drafts round-trip and carry the server's bounds.
  const draft = drafts.draftFromOptions({ removeSelectors: ['.a', '.b'], timeoutSeconds: 20, scope: 'visible', maxItems: 5, transport: 'auto', keepHtml: true })
  assert.equal(draft.removeSelectors, '.a\n.b')
  assert.deepEqual(drafts.optionsFromDraft(draft, 'cloud'), { removeSelectors: ['.a', '.b'], keepHtml: true, timeoutSeconds: 20, scope: 'visible', maxItems: 5, transport: 'auto' })
  assert.equal(drafts.countSetOptions(draft, 'cloud'), 6)
  assert.equal(drafts.countSetOptions(draft, 'browser'), 5)
  const bad = { ...drafts.EMPTY_OPTION_DRAFT, timeoutSeconds: '5', scope: 'visible', maxItems: '51', transport: 'http', waitFor: '.a', scroll: true }
  assert.deepEqual(Object.keys(drafts.draftErrors(bad, 'cloud')).sort(), ['maxItems', 'scroll', 'timeoutSeconds', 'waitFor'])
  assert.deepEqual(Object.keys(drafts.draftErrors(bad, 'browser')).sort(), ['maxItems', 'timeoutSeconds'], 'the browser always runs page scripts')
  assert.deepEqual(drafts.optionsFromDraft({ ...drafts.EMPTY_OPTION_DRAFT, maxItems: '3' }, 'cloud'), {})

  // Lifecycle reads through the shared kind and its phases.
  const job = { id: 'job000000000001', owner: 'owner', status: 'rendering', runner: 'cloud', document: '', cancelRequested: false }
  assert.equal(api.isCrawlJobActive(job), true)
  assert.equal(api.isCrawlJobActive({ ...job, status: 'partial' }), false)
  assert.deepEqual(taskPhase(crawlJobKind.describe(job)), { done: 1, total: 4 })
  assert.equal(taskStatusMeta(crawlJobKind, job).label, '等待渲染')
  assert.equal(taskStatusMeta(crawlJobKind, { ...job, status: 'partial' }).label, '内容不完整')
  assert.equal(taskStatusMeta(crawlJobKind, { ...job, cancelRequested: true }).label, '结束中')
  assert.equal(api.hasCrawlDocument({ status: 'succeeded', document: 'doc000000000001' }), true)
  assert.equal(api.hasCrawlDocument({ status: 'failed', document: 'doc000000000001' }), false)
  const now = Date.parse('2026-11-08T12:00:00Z')
  assert.equal(api.isCrawlWorkerOnline({ lastSeenAt: '2026-11-08 11:59:00.000Z' }, now), true)
  assert.equal(api.isCrawlWorkerOnline({ lastSeenAt: '2026-11-08 11:50:00.000Z' }, now), false)
  assert.equal(api.isCrawlWorkerOnline({ lastSeenAt: '' }, now), false)

  // Display helpers.
  assert.equal(display.scheduleText({ intervalMinutes: 0, enabled: false, nextRunAt: '' }, now), '仅手动')
  assert.equal(display.scheduleText({ intervalMinutes: 60, enabled: false, nextRunAt: '' }, now), '每小时 · 已暂停')
  assert.equal(display.scheduleText({ intervalMinutes: 60, enabled: true, nextRunAt: '2026-11-08 12:20:00.000Z' }, now), '每小时 · 20 分钟后')
  assert.equal(display.crawlErrorText('LOGIN_REQUIRED', 'cloud'), '页面需要登录，可以改用浏览器抓取')
  assert.equal(display.crawlErrorText('LOGIN_REQUIRED', 'browser'), '页面需要登录')
  assert.equal(display.crawlErrorText('NO_WORKER', 'browser'), '浏览器扩展长时间不在线，任务已结束')
  assert.equal(display.crawlErrorText('WEIRD', 'cloud', 'raw text'), 'raw text')
  assert.equal(display.mayNeedLogin({ runner: 'cloud', status: 'failed', errorCode: 'ACCESS_DENIED' }), true)
  assert.equal(display.mayNeedLogin({ runner: 'browser', status: 'failed', errorCode: 'ACCESS_DENIED' }), false)
  assert.equal(display.mayNeedLogin({ runner: 'cloud', status: 'failed', errorCode: 'NOT_FOUND' }), false)
  assert.deepEqual(display.loginHosts(['https://www.zhihu.com/question/1', 'https://example.com/', 'https://weibo.com/u/1']), ['zhihu.com', 'weibo.com'])
  assert.equal(display.shortUrl('https://example.com/'), 'example.com')
  assert.equal(display.shortUrl(`https://example.com/${'a'.repeat(100)}`).length, 72)
  assert.equal(display.jobTitle({ title: '', url: 'https://x.com/a/status/1' }), 'x.com/a/status/1')
  assert.equal(display.categoryLabel('social_media'), '社交媒体')
  assert.equal(display.categoryLabel('行业新闻'), '行业新闻')
  assert.equal(display.lastOutcomeText({ lastStatus: '', lastRunAt: '' }, now), '尚未抓取')
  assert.equal(display.extractorLabel('site:x'), '站点规则 · x')
  assert.equal(display.warningLabel('route_fell_back'), '静态读取没有内容，已改用浏览器')
  assert.equal(display.wasUpdated({ created: '2026-11-07 10:00:00.000Z', changedAt: '2026-11-07 10:00:00.500Z' }), false)
  assert.equal(display.wasUpdated({ created: '2026-11-07 10:00:00.000Z', changedAt: '2026-11-07 11:00:00.000Z' }), true)
  assert.equal(display.excerptText('# 标题\n\n> 引用 **重点** [链接](https://a.dev) ![图](x.png)\n- 一项'), '标题 引用 重点 链接 一项')
  const started = performance.now()
  display.excerptText('[a]('.repeat(200_000) + '['.repeat(200_000))
  assert.ok(performance.now() - started < 200, 'excerpts of hostile text stay linear')
  assert.equal(display.documentFilename({ title: ' a/b:c ' }).endsWith('.md'), true)
  assert.match(display.documentMarkdown({ title: 'T "q"', canonicalUrl: '', url: 'https://a.dev/', byline: '', siteName: '', publishedAt: '', fetchedAt: '2026-11-08', markdown: '# Hi' }), /^---\ntitle: "T \\"q\\""\nsource: "https:\/\/a.dev\/"\nfetched: "2026-11-08"\n---\n\n# Hi\n$/u)

  // Writes: exact payloads and routes.
  const target = { id: 'target000000001', owner: 'owner', url: 'https://a.dev/', runner: 'cloud', options: null }
  const calls = []
  let respond = () => Response.json(target)
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(input), init })
    return respond(new URL(input), init)
  }
  const body = () => JSON.parse(calls.at(-1).init.body)

  const created = await api.createCrawlTarget('target000000002', { url: 'https://x.com/a', name: '', runner: 'browser', category: '', options: { transport: 'http' }, intervalMinutes: 60, enabled: true })
  assert.deepEqual(created.options, {}, 'a null options column reads as no options')
  assert.equal(calls.at(-1).url.pathname, '/api/collections/aw_crawl_targets/records')
  assert.deepEqual(body(), { owner: 'owner', url: 'https://x.com/a', name: '', runner: 'browser', category: '', options: { scope: 'visible' }, intervalMinutes: 60, enabled: true, id: 'target000000002' })

  await api.updateCrawlTarget(target, { enabled: false })
  assert.equal(calls.at(-1).init.method, 'PATCH')
  assert.deepEqual(body(), { enabled: false })
  await api.updateCrawlTarget(target, { runner: 'browser', options: { transport: 'http', keepHtml: true } })
  assert.deepEqual(body(), { runner: 'browser', options: { keepHtml: true } }, 'options are read against the new runner')

  respond = () => Response.json({ ...job, status: 'queued' })
  await api.createCrawlJob('job000000000002', { url: 'https://a.dev/', runner: 'cloud', category: ' 新闻 ', options: { transport: 'browser' } })
  assert.equal(calls.at(-1).url.pathname, '/api/collections/aw_crawl_jobs/records')
  assert.deepEqual(body(), { owner: 'owner', url: 'https://a.dev/', runner: 'cloud', category: '新闻', options: { transport: 'browser' }, id: 'job000000000002' })
  await api.crawlTarget('job000000000003', target)
  assert.deepEqual(body(), { owner: 'owner', target: target.id, id: 'job000000000003' }, 'a saved page is crawled with its own settings')

  // A rerun of a saved page goes through the page; a link's job may move to the browser.
  const finished = { ...job, status: 'failed', url: 'https://a.dev/', category: 'webpage', options: { transport: 'http' }, target: '' }
  await api.rerunCrawlJob('job000000000004', finished, 'browser')
  assert.deepEqual(body(), { owner: 'owner', url: 'https://a.dev/', runner: 'browser', category: 'webpage', options: {}, rerunOf: job.id, id: 'job000000000004' })
  await api.rerunCrawlJob('job000000000005', { ...finished, target: target.id })
  assert.deepEqual(body(), { owner: 'owner', target: target.id, rerunOf: job.id, id: 'job000000000005' })
  assert.throws(() => api.rerunCrawlJob('job000000000006', job), /还没有结束/u)

  respond = () => Response.json({ canceled: true })
  await api.cancelCrawlJob(job)
  assert.equal(calls.at(-1).url.pathname, `/api/anyworkflow/crawl/jobs/${job.id}/cancel`)
  assert.equal(calls.at(-1).init.method, 'POST')
  await assert.rejects(api.cancelCrawlJob({ ...job, status: 'succeeded' }), /已经结束/u)
  await assert.rejects(api.deleteCrawlJob(job), /还没有结束/u)

  respond = () => Response.json({ items: [], page: 1, perPage: 20, totalItems: 0, totalPages: 0 })
  await api.listActiveCrawlJobs()
  assert.equal(calls.at(-1).url.searchParams.get('filter'), 'owner="owner" && (status="queued" || status="opening" || status="rendering" || status="extracting" || status="uploading")')
  await api.listCrawlJobs({ page: 1, target: 't"1' })
  assert.equal(calls.at(-1).url.searchParams.get('filter'), 'owner="owner" && target="t\\"1"')
  await api.listCrawlDocuments({ page: 2, target: 't1', category: 'webpage', search: ' 新闻 ' })
  const query = calls.at(-1).url.searchParams
  assert.equal(query.get('filter'), 'owner="owner" && target="t1" && category="webpage" && (title~"新闻" || markdown~"新闻" || byline~"新闻" || siteName~"新闻" || url~"新闻")')
  assert.equal(query.get('sort'), '-fetchedAt,-id')
  assert.match(query.get('fields'), /markdown:excerpt\(160,true\)/u)
  assert.doesNotMatch(query.get('fields'), /html|items|links|structuredData/u, 'lists never load full records')

  // A lost create response resolves to the saved record, not a second job.
  let posts = 0
  respond = (_url, init) => {
    if (init.method === 'POST') {
      posts += 1
      return Response.json({ message: 'The record id is not unique.' }, { status: 400 })
    }
    return Response.json({ ...job, id: 'job000000000007' })
  }
  assert.equal((await api.createCrawlJob('job000000000007', { url: 'https://a.dev/', runner: 'cloud', category: '', options: {} })).id, 'job000000000007')
  assert.equal(posts, 1)

  // A record that belongs to someone else is never trusted.
  respond = () => Response.json({ ...target, owner: 'stranger' })
  await assert.rejects(api.getCrawlDocument('doc000000000001'), /归属/u)
  console.log('crawl API checks passed')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
