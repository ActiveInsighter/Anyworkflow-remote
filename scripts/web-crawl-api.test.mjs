import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const api = await server.ssrLoadModule('/src/lib/api/web-crawl.ts')
  const display = await server.ssrLoadModule('/src/features/web-crawl/lib/crawl-display.ts')
  const drafts = await server.ssrLoadModule('/src/features/web-crawl/lib/option-draft.ts')
  const results = await server.ssrLoadModule('/src/features/web-crawl/lib/run-results.ts')
  const { webCrawlKind } = await server.ssrLoadModule('/src/lib/tasks/index.ts')
  const { taskStatusMeta, taskPhase } = await server.ssrLoadModule('/src/lib/tasks/status.ts')
  setSession({ token: 'fixture-token', record: { id: 'owner' }, baseUrl: 'https://pb.example.invalid' })

  // New targets: only set options are stored, X profiles widen to visible posts, a status link does not.
  const settings = { mode: 'auto', contentType: '', options: { selector: ' ', delay: 2 }, intervalMinutes: 1440, enabled: true }
  assert.deepEqual(api.targetInputFor('https://example.com/news', settings), {
    mode: 'auto', contentType: '', options: { delay: 2 }, intervalMinutes: 1440, enabled: true, url: 'https://example.com/news', name: '',
  })
  assert.equal(api.targetInputFor('https://x.com/openai', settings).options.xScope, 'visible')
  assert.equal(api.targetInputFor('https://x.com/openai/status/1', settings).options.xScope, undefined)
  assert.equal(api.targetInputFor('https://example.com/', { ...settings, intervalMinutes: 0 }).enabled, false)
  assert.equal(api.defaultContentType({ url: 'https://twitter.com/a', mode: 'auto' }), 'social_media')
  assert.equal(api.defaultContentType({ url: 'https://x.com/a', mode: 'page' }), 'webpage')
  assert.equal(api.isXStatusUrl('https://x.com/i/web/status/123'), true)
  assert.equal(api.isXStatusUrl('https://example.com/a/status/123'), false)

  // Option drafts round-trip and carry the same bounds as the server.
  const draft = drafts.draftFromTarget({ mode: 'x', options: { xScope: 'visible', maxPosts: 5, timeout: 20 } })
  assert.deepEqual(drafts.optionsFromDraft(draft), { mode: 'x', options: { timeout: 20, xScope: 'visible', maxPosts: 5 } })
  assert.equal(drafts.countSetOptions(draft), 4)
  assert.deepEqual(Object.keys(drafts.draftErrors({ ...drafts.EMPTY_OPTION_DRAFT, delay: '31', timeout: '0', transport: 'http', waitFor: '.a' })), ['delay', 'timeout', 'waitFor'])
  assert.deepEqual(drafts.optionsFromDraft({ ...drafts.EMPTY_OPTION_DRAFT, maxPosts: '3' }).options, {})

  // Lifecycle reads through the shared kind: one page has phases, several measure pages reported.
  const run = { id: 'run000000000001', owner: 'owner', status: 'running', targets: ['t1', 't2'], targetCount: 2, reportedCount: 1, cancelRequested: false }
  assert.equal(api.isCrawlRunActive(run), true)
  assert.equal(api.isCrawlRunActive({ ...run, status: 'partial' }), false)
  assert.deepEqual([...api.busyTargetIds([run, { ...run, id: 'b', status: 'failed', targets: ['t3'] }])], ['t1', 't2'])
  assert.equal(webCrawlKind.describe(run).progress, 50)
  assert.deepEqual(taskPhase(webCrawlKind.describe({ ...run, targetCount: 1 })), { done: 2, total: 3 })
  assert.equal(taskStatusMeta(webCrawlKind, { ...run, status: 'pending' }).label, '等待运行器')
  assert.equal(taskStatusMeta(webCrawlKind, { ...run, cancelRequested: true }).label, '结束中')
  assert.equal(api.crawlRunUrl({ githubRunId: '42' }), 'https://github.com/ActiveInsighter/webpage-parser-action/actions/runs/42')
  assert.equal(api.crawlRunUrl({ githubRunId: '' }), undefined)

  // Each page of a run reads on its own; a page a finished run never reported counts as failed.
  const items = [
    { target: 't1', url: 'https://a.dev/', name: '', mode: 'auto', contentType: 'webpage', options: {} },
    { target: 't2', url: 'https://b.dev/', name: 'B', mode: 'auto', contentType: 'webpage', options: {} },
  ]
  const reported = { t1: { status: 'succeeded', itemCount: 3, recordIds: [], title: 'A page', error: '', errorCode: '' } }
  assert.deepEqual(results.pageResults({ ...run, items, results: reported }).map((page) => [page.title, page.outcome, page.itemCount]), [['A page', 'succeeded', 3], ['B', 'waiting', 0]])
  const failed = results.pageResults({ ...run, status: 'partial', items, results: { ...reported, t2: { status: 'failed', itemCount: 0, recordIds: [], error: 'HTTP 403', errorCode: 'http_403' } } })
  assert.equal(failed[1].error, '网站拒绝了匿名访问（403）')
  assert.equal(failed[1].title, 'B', 'a page keeps its own name')
  assert.equal(results.runFailureText({ ...run, status: 'failed', items: [items[0]], error: 'Blocked by anti-bot protection: Cloudflare JS challenge', results: { t1: { status: 'failed', itemCount: 0, recordIds: [], error: 'Blocked by anti-bot protection: Cloudflare JS challenge', errorCode: 'blocked' } } }), '网站拦截了自动访问（人机验证），稍后会再试')
  assert.equal(results.runFailureText({ ...run, status: 'partial', items, error: '2 个页面抓取失败', results: { t1: { status: 'failed', errorCode: 'http_500' }, t2: { status: 'failed', errorCode: 'timeout' } } }), '2 个页面抓取失败')
  assert.equal(results.runFailureText({ ...run, status: 'failed', items, error: '抓取任务异常结束', results: null }), '抓取任务异常结束')
  const unnamed = results.pageResults({ ...run, status: 'failed', items: [items[0]], results: { t1: { status: 'failed', itemCount: 0, recordIds: [], title: '404 Not Found', error: '', errorCode: 'http_404' } } })
  assert.equal(unnamed[0].title, 'https://a.dev/', 'an error page never names the page')
  assert.equal(results.pageResults({ ...run, status: 'failed', items, results: {} })[0].outcome, 'failed')

  // Display helpers.
  const now = Date.parse('2026-11-07T12:00:00Z')
  assert.equal(display.scheduleText({ intervalMinutes: 0, enabled: false, nextRunAt: '' }, now), '仅手动')
  assert.equal(display.scheduleText({ intervalMinutes: 60, enabled: false, nextRunAt: '' }, now), '每小时 · 已暂停')
  assert.equal(display.scheduleText({ intervalMinutes: 60, enabled: true, nextRunAt: '2026-11-07 12:20:00.000Z' }, now), '每小时 · 20 分钟后')
  assert.equal(display.crawlErrorText('http_503'), '网站暂时不可用（503）')
  assert.equal(display.crawlErrorText('weird', 'raw text'), 'raw text')
  assert.equal(display.contentTypeLabel('social_media'), '社交媒体')
  assert.equal(display.contentTypeLabel('行业新闻'), '行业新闻')
  assert.equal(display.wasUpdated({ created: '2026-11-07 10:00:00.000Z', changedAt: '2026-11-07 10:00:00.500Z' }), false)
  assert.equal(display.wasUpdated({ created: '2026-11-07 10:00:00.000Z', changedAt: '2026-11-07 11:00:00.000Z' }), true)
  assert.equal(display.runTitle({ items: [items[0]], targetCount: 1 }), 'a.dev')
  assert.equal(display.runTitle({ items, targetCount: 2 }), '2 个页面')
  assert.equal(display.runOutcomeText({ reportedCount: 2, succeededCount: 1, targetCount: 2, itemCount: 3 }), '1/2 个页面成功 · 3 条内容')
  assert.equal(display.excerptText('# 标题\n\n> 引用 **重点** [链接](https://a.dev) ![图](x.png)\n- 一项'), '标题 引用 重点 链接 一项')
  const started = performance.now()
  display.excerptText('[a]('.repeat(200_000) + '['.repeat(200_000))
  assert.ok(performance.now() - started < 200, 'excerpts of hostile text stay linear')
  assert.equal(display.contentFilename({ title: ' a/b:c ', externalId: '', id: 'x' }), 'a b c.md')

  // Writes: exact payloads and routes.
  const target = { id: 'target000000001', owner: 'owner', url: 'https://a.dev/', options: null }
  const calls = []
  let respond = () => Response.json(target)
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(input), init })
    return respond(new URL(input), init)
  }
  const created = await api.createCrawlTarget('target000000002', api.targetInputFor('https://a.dev/', settings))
  assert.deepEqual(created.options, {}, 'a null options column reads as no options')
  assert.equal(calls.at(-1).url.pathname, '/api/collections/aw_crawl_targets/records')
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), {
    owner: 'owner', url: 'https://a.dev/', name: '', mode: 'auto', contentType: '', options: { delay: 2 }, intervalMinutes: 1440, enabled: true, id: 'target000000002',
  })

  await api.updateCrawlTarget(target, { enabled: false })
  assert.equal(calls.at(-1).init.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { enabled: false })

  respond = () => Response.json({ ...run, status: 'queued' })
  await api.startCrawl('run000000000002', ['t1', 't2'])
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { owner: 'owner', targets: ['t1', 't2'], id: 'run000000000002' })
  assert.throws(() => api.startCrawl('run000000000003', Array.from({ length: 11 }, (_, index) => `t${index}`)), /最多抓取 10/u)
  assert.throws(() => api.startCrawl('run000000000003', []), /最多抓取 10/u)

  respond = () => Response.json({ canceled: true })
  await api.cancelCrawlRun(run)
  assert.equal(calls.at(-1).url.pathname, `/api/anyworkflow/crawl/runs/${run.id}/cancel`)
  assert.equal(calls.at(-1).init.method, 'POST')
  await assert.rejects(api.cancelCrawlRun({ ...run, status: 'succeeded' }), /已经结束/u)
  await assert.rejects(api.deleteCrawlRun(run), /还没有结束/u)

  respond = () => Response.json({ items: [], page: 1, perPage: 20, totalItems: 0, totalPages: 0 })
  await api.listTargetRuns('t"1')
  assert.equal(calls.at(-1).url.searchParams.get('filter'), 'owner="owner" && targets.id ?= "t\\"1"')
  await api.listCrawledContents({ page: 2, target: 't1', type: 'webpage', search: ' 新闻 ' })
  const query = calls.at(-1).url.searchParams
  assert.equal(query.get('filter'), 'owner="owner" && target="t1" && type="webpage" && (title~"新闻" || content~"新闻" || author~"新闻" || handle~"新闻")')
  assert.equal(query.get('sort'), '-fetchedAt,-id')
  assert.match(query.get('fields'), /content:excerpt\(160,true\)/u)
  assert.doesNotMatch(query.get('fields'), /media|metadata/u, 'lists never load full records')

  // A lost create response resolves to the saved record, not a second target.
  let posts = 0
  respond = (_url, init) => {
    if (init.method === 'POST') {
      posts += 1
      return Response.json({ message: 'The record id is not unique.' }, { status: 400 })
    }
    return Response.json(target)
  }
  assert.equal((await api.createCrawlTarget(target.id, api.targetInputFor(target.url, settings))).id, target.id)
  assert.equal(posts, 1)

  // A record that belongs to someone else is never trusted.
  respond = () => Response.json({ ...target, owner: 'stranger' })
  await assert.rejects(api.getCrawledContent('content00000001'), /归属/u)
  console.log('web crawl API checks passed')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
