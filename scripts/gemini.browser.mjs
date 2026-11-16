import { selectOption } from './select-helpers.mjs'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const page = await context.newPage()
page.setDefaultTimeout(12000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', msg => {if(msg.type()==='error') console.error('Browser:',msg.text())})
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
const fileId = '11111111-1111-4111-8111-111111111111.md'
const content = '# 第一节\n原始正文\n<!-- aw:split -->\n# 第二节\n后续正文'
const file = { id: fileId, fileName: '分段讲义.md', size: Buffer.byteLength(content), sourceUrl: `https://remote.example.invalid/api/library/sources/${fileId}`, expiresAt: '', createdAt: '2026-11-15T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z', folder: '' }
let jobs = [], posts = [], loseOnce = false, wakes = 0
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
  return Array.from({ length: job.totalChunks }, (_, index) => index + 1).map(index => ({ id: job.id.slice(0, 14) + index, owner: 'owner-1', job: job.id, index, part: index, sourceName: file.fileName, status: index === 1 ? 'succeeded' : 'failed', reply: index === 1 ? '# 逐段保存的回复\n<script>window.unsafe = true</script>' : '已保留的截断正文', inputText: index === 1 ? '# 第一节\n原始正文' : '# 第二节', error: index === 2 ? '回复达到输出上限' : '', finishReason: index === 2 ? 'MAX_TOKENS' : 'STOP', response: index === 1 ? { version: 1, protocol: 'interactions', parts: [{ id: 's0', type: 'reasoning', text: '公开的思考摘要' }, { id: 's1', type: 'tool-call', name: 'code_execution', callId: 'call-1', data: { code: 'print(42)' } }, { id: 's2', type: 'tool-result', name: 'code_execution', callId: 'call-1', data: { output: '42' } }], metadata: { status: 'completed', citations: [{ uri: 'https://example.com/source', title: '参考资料' }] }, capture: { totalParts: 3, omittedParts: 0, truncated: false } } : null, usage: index === 1 ? { totalTokenCount: 94123, promptTokenCount: 40000, candidatesTokenCount: 2000, thoughtsTokenCount: 30000, toolUseTokenCount: 22123, cachedContentTokenCount: 5000, agentStepCount: 8 } : { totalTokenCount: 123 } }))
}
await context.route('https://pb.example.invalid/**', route => {
  const request = route.request(), url = new URL(request.url()), body = ['POST', 'PUT', 'PATCH'].includes(request.method()) ? request.postDataJSON() : null
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
      const parent = jobs.find(item => messagesFor(item).some(message => message.id === body.parentMessage))
      job = { ...body, title: parent?.title || body.prompt, threadRoot: parent?.threadRoot || body.id, archived: false, history: parent ? [{role:'user', text:parent.prompt},{role:'model',text:messagesFor(parent)[0].reply}] : [], owner: 'owner-1', status: 'queued', totalChunks: body.sources.length ? 2 : 1, completedChunks: 0, failedChunks: 0, sources: body.sources.map(source => ({ id: source.id, name: source.name })), options: { concurrency: body.concurrency, maxOutputTokens: body.maxOutputTokens, thinkingLevel: body.thinkingLevel }, created: '2026-11-15T01:00:00Z', updated: '2026-11-15T01:00:00Z', error: '', githubRunId: '123' }
      jobs.unshift(job)
    }
    if (loseOnce) { loseOnce = false; return route.fulfill({ status: 503, json: { message: '提交响应丢失，请重试' } }) }
    return route.fulfill({ json: job })
  }
  if (url.pathname.endsWith('/metadata')) {
    const job = jobs.find(item => url.pathname.includes(item.id))
    for (const member of jobs.filter(item => item.threadRoot === job.threadRoot)) Object.assign(member, body)
    return route.fulfill({json:job})
  }
  if (/\/gemini\/threads\/[^/]+$/.test(url.pathname)) {
    const job = jobs.find(item => url.pathname.endsWith(item.id))
    jobs = jobs.filter(item => item.threadRoot !== job.threadRoot)
    return route.fulfill({json:{deleted:true}})
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
    if (!job) return route.fulfill({status:404,json:{message:'Not found'}})
    return route.fulfill({ json: { job, messages: messagesFor(job).map(({ reply, inputText, usage, ...summary }) => ({ ...summary, updated: job.updated })) } })
  }
  if (/\/gemini\/jobs\/[^/]+\/messages\/[^/]+$/.test(url.pathname)) {
    const jobId = url.pathname.split('/').at(-3)
    const job = jobs.find(item => item.id === jobId)
    return route.fulfill({ json: {...messagesFor(job).find(item => url.pathname.endsWith(item.id)), status: job.status === 'queued' ? 'queued' : job.status === 'canceled' ? 'canceled' : 'succeeded'} })
  }
  if (url.pathname.includes('/aw_gemini_jobs/records/')) return route.fulfill({ json: jobs.find(job => url.pathname.endsWith(job.id)) })
  if (url.pathname.includes('/aw_gemini_jobs/records')) return route.fulfill({ json: listing(jobs) })
  if (url.pathname.includes('/aw_gemini_messages/records')) {
    const messages = jobs.flatMap(messagesFor)
    const detail = messages.find(item => url.pathname.endsWith(item.id))
    return route.fulfill({ json: detail || listing(messages.map(({ reply, inputText, ...metadata }) => metadata)) })
  }
  return route.fulfill({ json: listing([]) })
})

try {
  const input = page.getByRole('textbox', {name:'Message input'})
  const send = page.getByRole('button', {name:'Send message',exact:true})
  const newChat = () => page.getByRole('button', {name:'New Thread',exact:true}).click()
  await page.goto(`${process.env.TEST_BASE_URL}/gemini`)
  await page.getByText('How can I help you today?',{exact:true}).waitFor()
  await input.fill('直接问题')
  await send.click()
  await page.getByRole('button', {name:'Stop generating',exact:true}).waitFor()
  assert.equal(posts[0].prompt,'直接问题')
  assert.deepEqual(posts[0].sources,[])
  await page.getByRole('button', {name:'Stop generating',exact:true}).click()
  await send.waitFor()
  await newChat()
  await page.waitForURL(url => !url.searchParams.has('job'))
  await page.getByText('How can I help you today?',{exact:true}).waitFor()
  await input.fill('逐段整理，不要合并')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', {name:'Add Attachment',exact:true}).click()
  await (await chooser).setFiles({name:file.fileName,mimeType:'text/markdown',buffer:Buffer.from(content)})
  await page.getByRole('button',{name:`Remove ${file.fileName}`,exact:true}).waitFor()
  loseOnce = true
  await send.click()
  await page.getByText('提交响应丢失，请重试',{exact:true}).waitFor()
  assert.equal(await input.inputValue(),'逐段整理，不要合并')
  await send.click()
  await page.getByRole('button',{name:'Stop generating',exact:true}).waitFor()
  await page.waitForURL(url=>url.searchParams.get('job')===jobs[0].id)
  assert.equal(posts.at(-1).id,posts.at(-2).id)
  assert.equal(posts.at(-1).sources[0].content,content)
  assert.equal(jobs.length,2)
  Object.assign(jobs[0],{status:'partial',completedChunks:1,failedChunks:1,updated:'2026-11-16T01:00:00Z'})
  await page.reload()
  await page.getByRole('heading',{name:'逐段保存的回复',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.unsafe),undefined)
  await page.getByRole('button',{name:'Response details',exact:true}).click()
  const details = page.getByRole('dialog',{name:'Response details',exact:true})
  await details.getByText('94123',{exact:false}).waitFor()
  assert.ok((await details.innerText()).includes('https://example.com/source'))
  const download = page.waitForEvent('download')
  await details.getByRole('button',{name:'Export JSON',exact:true}).click()
  assert.ok((await download).suggestedFilename().endsWith('.json'))
  await details.getByRole('button',{name:'Close',exact:true}).click()
  // Actual official disclosure UIs, without custom thought/tool renderers.
  await page.locator('[data-slot="reasoning-trigger"]').first().click()
  await page.getByText('公开的思考摘要',{exact:true}).waitFor()
  await page.locator('[data-slot="tool-group-trigger"]').first().click()
  await page.getByRole('button',{name:/Used tool: code_execution/}).click()
  await page.getByText('print(42)',{exact:false}).waitFor()
  for (const theme of ['light','dark']) {
    await page.emulateMedia({colorScheme:theme})
    for (const width of [320,390,760,1440]) {
      await page.setViewportSize({width,height:1000})
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} overflow ${width}`)
      const box = await input.boundingBox()
      assert.ok(box && box.y+box.height<=1000,'composer remains visible')
      if (process.env.SCREENSHOT_DIR) {
        await mkdir(process.env.SCREENSHOT_DIR,{recursive:true})
        await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/official-${theme}-${width}.png`,style:'[data-sonner-toaster] { visibility:hidden!important; }'})
      }
    }
  }
  await page.setViewportSize({width:1440,height:1000})
  await selectOption(page.getByRole('combobox',{name:'选择分段'}),jobs[0].id.slice(0,14)+'2')
  await page.getByText('已保留的截断正文',{exact:true}).waitFor()
  await selectOption(page.getByRole('combobox',{name:'选择分段'}),jobs[0].id.slice(0,14)+'1')
  await page.getByRole('heading',{name:'逐段保存的回复',exact:true}).waitFor()
  const parentMessage = jobs[0].id.slice(0,14)+'1'
  await input.fill('继续解释')
  await input.press('Enter')
  await page.waitForURL(url=>url.searchParams.get('job')===jobs[0].id && jobs.length===3)
  assert.equal(posts.at(-1).parentMessage,parentMessage)
  assert.equal(posts.at(-1).prompt,'继续解释')
  assert.equal(await page.locator('[data-slot="aui_thread-list-item"]').count(),2,'follow-ups share one sidebar thread')
  Object.assign(jobs[0],{status:'succeeded',updated:'2026-11-16T02:00:00Z'})
  await page.reload()
  await page.getByRole('heading',{name:'逐段保存的回复',exact:true}).last().waitFor()
  await page.waitForFunction(()=>document.querySelectorAll('[data-slot="tool-group-trigger"]').length===2)
  await page.getByLabel('Search threads').fill('逐段整理')
  const row = page.locator('[data-slot="aui_thread-list-item"]').first()
  await row.getByRole('button',{name:'More options'}).click()
  await page.getByRole('menuitem',{name:'Rename',exact:true}).click()
  await page.getByRole('textbox',{name:'Rename thread'}).fill('官方 UI 会话')
  await page.getByRole('textbox',{name:'Rename thread'}).press('Enter')
  await page.getByLabel('Search threads').fill('官方 UI')
  await row.getByRole('button',{name:'More options'}).click()
  await page.getByRole('menuitem',{name:'Archive',exact:true}).click()
  await page.getByRole('button',{name:'Archived chats',exact:true}).click()
  const archive = page.getByRole('dialog',{name:'Archived chats'})
  await archive.getByRole('button',{name:'官方 UI 会话',exact:true}).waitFor()
  await archive.getByRole('button',{name:'Restore',exact:true}).click()
  await archive.getByText('No archived chats').waitFor()
  await archive.getByRole('button',{name:'Close',exact:true}).click()
  await row.getByRole('button',{name:'More options'}).click()
  await page.getByRole('menuitem',{name:'Delete',exact:true}).click()
  await page.waitForURL(url=>!url.searchParams.has('job'))
  assert.equal(jobs.length,1,'deleting a thread deletes all turns')
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Toggle Sidebar'}).click()
  await page.getByRole('dialog').waitFor()
  await newChat()
  await page.getByRole('dialog').waitFor({state:'hidden'})
  await page.getByText('How can I help you today?',{exact:true}).waitFor()
  await page.goto(`${process.env.TEST_BASE_URL}/gemini?file=${fileId}`)
  await page.getByRole('button',{name:`Remove ${file.fileName}`,exact:true}).waitFor()
  await page.waitForURL(url=>!url.searchParams.has('file'))
  assert.ok(wakes>=3)
  assert.deepEqual(errors,[])
  console.log('Official assistant-ui: send, cancel, attachment retry, native reasoning/tools, response metadata, follow-ups, rename/archive/delete, mobile and 8 visual states passed')
} catch(error) { console.error('Page errors',errors); console.error((await page.locator('body').innerText()).slice(-7000)); await mkdir('.deployment-evidence/official-ui',{recursive:true}); await page.screenshot({path:'.deployment-evidence/official-ui/browser-failure.png'}); throw error } finally { await browser.close() }
