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
const feedback = new Map()
let config = { owner: 'owner-1', revision: 0, config: { model: 'gemini-3.5-flash-lite', systemPrompt: '', delimiter: '<!-- aw:split -->', concurrency: 5, thinkingLevel: '', maxOutputTokens: 8192, rpmPerKey: 15, rpdPerKey: 500 } }
let saved = []
const catalog = { provider: 'gemini', status: 'ready', syncedAt: '2026-11-15T00:00:00Z', models: [{id:'gemini-3.5-flash-lite',displayName:'Gemini 3.5 Flash Lite',inputTokenLimit:1000000,outputTokenLimit:65536,methods:['generateContent'],thinking:true}, { id: 'gemini-example-latest', displayName: 'Gemini latest', description: '', inputTokenLimit: 1000000, outputTokenLimit: 65536, methods: ['generateContent'], thinking: true }] }
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
  return Array.from({ length: job.totalChunks }, (_, index) => index + 1).map(index => ({ id: job.id.slice(0, 14) + index, owner: 'owner-1', job: job.id, index, part: index, sourceId: job.sources[0]?.id || '', startedAt:'2026-11-15T01:00:00Z', finishedAt:'2026-11-15T01:00:04.030Z', feedback:feedback.get(job.id.slice(0,14)+index)?.type || '', feedbackComment:feedback.get(job.id.slice(0,14)+index)?.comment || '', sourceName: job.sources.length ? file.fileName : '消息正文', status: index === 1 ? 'succeeded' : 'failed', reply: index === 1 ? '# 逐段保存的回复\n<script>window.unsafe = true</script>' : '已保留的截断正文', inputText: job.sources.length ? (index === 1 ? '# 第一节\n原始正文' : '# 第二节') : (job.text || ''), error: index === 2 ? '回复达到输出上限' : '', finishReason: index === 2 ? 'MAX_TOKENS' : 'STOP', response: index === 1 ? { version: 1, protocol: 'interactions', parts: [{ id: 's0', type: 'reasoning', text: '公开的思考摘要' }, { id: 's1', type: 'tool-call', name: 'code_execution', callId: 'call-1', data: { code: 'print(42)' } }, { id: 's2', type: 'tool-result', name: 'code_execution', callId: 'call-1', data: { output: '42' } }, {id:'s3',type:'tool-call',name:'search_docs',callId:'call-2',data:{query:'assistant-ui'}}, {id:'s4',type:'tool-result',name:'search_docs',callId:'call-2',data:{output:'documentation found'}}, {id:'s5',type:'tool-result',name:'provider_extra',data:{output:'unlinked result kept'}}, {id:'s6',type:'artifact',name:'output.txt',data:{mimeType:'text/plain',size:12}}], metadata: { status: 'completed', citations: [{ uri: 'https://example.com/source', title: '参考资料' }] }, capture: { totalParts: 3, omittedParts: 0, truncated: false } } : null, usage: index === 1 ? { totalTokenCount: 94123, promptTokenCount: 40000, candidatesTokenCount: 2000, thoughtsTokenCount: 30000, toolUseTokenCount: 22123, cachedContentTokenCount: 5000, agentStepCount: 8 } : { totalTokenCount: 123 } }))
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
      const replaced = jobs.find(item=>messagesFor(item).some(message=>message.id===body.replacesMessage))
      job = { ...body, title: replaced?.title || parent?.title || body.prompt, threadRoot: replaced?.threadRoot || parent?.threadRoot || body.id, archived: false, pinned:replaced?.pinned || false, parentMessage:replaced?.parentMessage || body.parentMessage || '', history:replaced?.history || (parent ? [{role:'user', text:parent.prompt},{role:'model',text:messagesFor(parent)[0].reply}] : []), owner: 'owner-1', status: 'queued', totalChunks: body.sources.length ? 2 : 1, completedChunks: 0, failedChunks: 0, sources: body.sources.map(source => ({ id: source.id, name: source.name })), options: { concurrency: body.concurrency, maxOutputTokens: body.maxOutputTokens, thinkingLevel: body.thinkingLevel }, created: '2026-11-15T01:00:00Z', updated: '2026-11-15T01:00:00Z', error: '', githubRunId: '123' }
      jobs.unshift(job)
    }
    if (loseOnce) { loseOnce = false; return route.fulfill({ status: 503, json: { message: '提交响应丢失，请重试' } }) }
    return route.fulfill({ json: job })
  }
  if (url.pathname.endsWith('/feedback')) {const mid=url.pathname.split('/').at(-2);feedback.set(mid,body);const job=jobs.find(item=>url.pathname.includes(item.id));return route.fulfill({json:{id:mid,owner:'owner-1',job:job.id,feedback:body.type}})}
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
  const input=page.getByRole('textbox',{name:'Message input',exact:true})
  const send=page.getByRole('button',{name:'Send message',exact:true})
  const menu=async()=>{await page.getByRole('button',{name:'Demo options',exact:true}).click()}
  const newChat=async()=>{await menu();await page.getByRole('menuitem',{name:/^New thread/}).click();await page.getByText('How can I help you today?',{exact:true}).waitFor()}
  await page.goto(`${process.env.TEST_BASE_URL}/gemini`)
  await page.getByText('How can I help you today?',{exact:true}).waitFor()
  await input.fill('直接问题');await send.click()
  await page.waitForURL(url=>url.searchParams.get('job')===jobs[0].id)
  await page.getByRole('button',{name:'Stop generating',exact:true}).click()
  await send.waitFor();assert.equal(posts[0].prompt,'直接问题');assert.deepEqual(posts[0].sources,[])
  await newChat()
  await menu();await page.getByRole('menuitem',{name:'Message settings',exact:true}).click()
  const settings=page.getByRole('dialog',{name:'消息配置',exact:true})
  await settings.getByLabel('并发数',{exact:true}).fill('3')
  await settings.getByLabel('系统提示词',{exact:true}).fill('准确保留公式')
  await settings.getByRole('button',{name:'保存配置',exact:true}).click();await settings.waitFor({state:'hidden'})
  await input.fill('逐段整理，不要合并')
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add attachment',exact:true}).click()
  await (await chooser).setFiles({name:file.fileName,mimeType:'text/markdown',buffer:Buffer.from(content)})
  await page.getByRole('button',{name:`Remove ${file.fileName}`,exact:true}).waitFor()
  loseOnce=true;await send.click();await page.getByText('提交响应丢失，请重试',{exact:true}).waitFor()
  assert.equal(await input.inputValue(),'逐段整理，不要合并')
  await send.click();await page.waitForURL(url=>url.searchParams.get('job')===jobs[0].id)
  assert.equal(posts.at(-1).id,posts.at(-2).id);assert.equal(posts.at(-1).sources[0].content,content)
  assert.ok(posts.at(-1).systemPrompt.includes('command chip'),'official slash instructions reach backend')
  Object.assign(jobs[0],{status:'partial',completedChunks:1,failedChunks:1,updated:'2026-11-16T01:00:00Z'})
  await page.reload();await page.getByRole('heading',{name:'逐段保存的回复',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.unsafe),undefined)
  await page.getByRole('button',{name:'reasoning',exact:true}).click();await page.getByText('公开的思考摘要',{exact:true}).waitFor()
  await page.getByRole('button',{name:'ran 2 tools',exact:true}).click()
  await page.getByRole('button',{name:'code_execution',exact:true}).click()
  await page.getByText('print(42)',{exact:false}).waitFor();await page.getByText('Parameters',{exact:true}).waitFor();await page.getByText('Result',{exact:true}).waitFor()
  await page.getByRole('button',{name:'provider_extra result',exact:true}).click();await page.getByText('unlinked result kept',{exact:false}).waitFor()
  await page.getByRole('button',{name:'Context usage',exact:true}).waitFor()
  await page.getByRole('button',{name:'Message timing',exact:true}).waitFor()
  await page.getByRole('button',{name:'Good response',exact:true}).click()
  await page.getByRole('button',{name:'Positive feedback submitted',exact:true}).waitFor()
  await menu();await page.getByRole('menuitem',{name:'Response details',exact:true}).click()
  const details=page.getByRole('dialog',{name:'Response details',exact:true})
  await details.getByText('94123',{exact:false}).waitFor();assert.ok((await details.innerText()).includes('https://example.com/source'))
  const download=page.waitForEvent('download');await details.getByRole('button',{name:'Export JSON',exact:true}).click();assert.ok((await download).suggestedFilename().endsWith('.json'))
  await details.getByRole('button',{name:'Close',exact:true}).click()
  for(const theme of ['light','dark']){
    await page.emulateMedia({colorScheme:theme})
    for(const width of [320,390,760,1440]){
      await page.setViewportSize({width,height:1000})
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} overflow ${width}`)
      const box=await input.boundingBox();assert.ok(box&&box.y+box.height<=1000,'official composer remains visible')
      assert.ok(await page.getByRole('button',{name:'Send message',exact:true}).isVisible())
      if(process.env.SCREENSHOT_DIR){await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/homepage-${theme}-${width}.png`,style:'[data-sonner-toaster]{visibility:hidden!important}'})}
    }
  }
  await page.setViewportSize({width:1440,height:1000})
  await page.getByRole('button',{name:'Full screen',exact:true}).click();await page.getByRole('dialog',{name:'Thread fullscreen'}).waitFor()
  await page.getByRole('button',{name:'Exit full screen',exact:true}).click();await page.getByRole('dialog',{name:'Thread fullscreen'}).waitFor({state:'hidden'})
  await menu();await page.getByRole('menuitem',{name:/^2\. /}).click();await page.getByText('已保留的截断正文',{exact:true}).waitFor()
  await menu();await page.getByRole('menuitem',{name:/^1\. /}).click();await page.getByRole('heading',{name:'逐段保存的回复',exact:true}).waitFor()
  const original=jobs[0].id,originalMessage=original.slice(0,14)+'1'
  await input.fill('继续解释');await input.press('Enter');await page.waitForURL(url=>url.searchParams.get('job')===jobs[0].id&&jobs.length===3)
  assert.equal(posts.at(-1).parentMessage,originalMessage)
  Object.assign(jobs[0],{status:'succeeded',updated:'2026-11-16T02:00:00Z'})
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-role="assistant"]').length===2)
  assert.equal(await page.getByRole('button',{name:'ran 2 tools',exact:true}).count(),2,'old tool records survive follow-up')
  const previousReply=jobs[0].id.slice(0,14)+'1'
  await page.getByRole('button',{name:'Regenerate response',exact:true}).last().click()
  await page.waitForURL(url=>url.searchParams.get('job')===jobs[0].id&&jobs.length===4)
  assert.equal(posts.at(-1).replacesMessage,previousReply)
  Object.assign(jobs[0],{status:'succeeded',updated:'2026-11-16T03:00:00Z'})
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-role="assistant"]').length===2)
  await page.locator('[data-role="user"]').last().hover();await page.getByRole('button',{name:'Edit message',exact:true}).last().click()
  await page.getByRole('textbox',{name:'Edit message',exact:true}).fill('修改后的问题')
  await page.getByRole('button',{name:'Update',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('job')===jobs[0].id&&jobs.length===5)
  assert.equal(posts.at(-1).prompt,'修改后的问题');assert.ok(posts.at(-1).replacesMessage)
  Object.assign(jobs[0],{status:'succeeded',updated:'2026-11-16T04:00:00Z'})
  await page.reload();await page.getByRole('heading',{name:'逐段保存的回复',exact:true}).last().waitFor()
  await page.getByRole('button',{name:'Report issue with response',exact:true}).last().click()
  await page.getByLabel('Wrong information',{exact:true}).check()
  await page.getByRole('button',{name:'Submit',exact:true}).click()
  await page.getByRole('button',{name:'Negative feedback submitted',exact:true}).last().waitFor()
  await menu();await page.getByRole('menuitem',{name:/Pin \/ unpin/}).click()
  await page.getByText('Pinned',{exact:true}).waitFor();assert.ok(jobs[0].pinned)
  await page.getByLabel('Search threads').fill('逐段整理')
  const row=page.getByRole('button',{name:'逐段整理，不要合并',exact:true}).locator('..')
  await row.getByRole('button',{name:'Thread actions',exact:true}).click();await page.getByRole('menuitem',{name:'Rename',exact:true}).click()
  await page.getByRole('textbox',{name:'Rename thread',exact:true}).fill('官网演示会话')
  await page.getByRole('textbox',{name:'Rename thread',exact:true}).press('Enter');await page.getByLabel('Search threads').fill('官网演示')
  const renamed=page.getByRole('button',{name:'官网演示会话',exact:true}).locator('..')
  await renamed.getByRole('button',{name:'Thread actions',exact:true}).click();await page.getByRole('menuitem',{name:'Archive',exact:true}).click()
  await page.getByRole('button',{name:'Archived (1)',exact:true}).click()
  await renamed.getByRole('button',{name:'Thread actions',exact:true}).click();await page.getByRole('menuitem',{name:'Unarchive',exact:true}).click()
  await renamed.getByRole('button',{name:'Thread actions',exact:true}).click();await page.getByRole('menuitem',{name:'Delete',exact:true}).click()
  await page.waitForURL(url=>!url.searchParams.has('job'));assert.equal(jobs.length,1)
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Open threads',exact:true}).click();await page.getByRole('dialog',{name:'Threads',exact:true}).waitFor()
  await page.getByRole('button',{name:'New thread',exact:true}).click();await page.getByRole('dialog',{name:'Threads',exact:true}).waitFor({state:'hidden'})
  await menu();await page.getByRole('menuitem',{name:'Message settings',exact:true}).click()
  await settings.getByLabel('系统提示词',{exact:true}).fill('a'.repeat(12000))
  await settings.getByRole('button',{name:'保存配置',exact:true}).click();await settings.waitFor({state:'hidden'})
  await input.fill('合法的最大系统提示词');await send.click();await page.waitForURL(url=>url.searchParams.has('job'))
  assert.equal(posts.at(-1).systemPrompt.length,12000,'valid maximum config remains usable without directives')
  await page.getByRole('button',{name:'Stop generating',exact:true}).click();await send.waitFor()
  await page.goto(`${process.env.TEST_BASE_URL}/gemini?file=${fileId}`)
  await page.getByRole('button',{name:`Remove ${file.fileName}`,exact:true}).waitFor();await page.waitForURL(url=>!url.searchParams.has('file'))
  assert.deepEqual(errors,[]);assert.ok(wakes>=4)
  console.log('Official HomeDemo: native layout, attachment retry, public traces, token use/timing, feedback, follow-ups, regenerate/edit, pin/archive/restore/delete, fullscreen, library and responsive modes passed')
}catch(error){console.error('Page errors',errors);console.error((await page.locator('body').innerText()).slice(-8000));await mkdir('.deployment-evidence/home-demo',{recursive:true});await page.screenshot({path:'.deployment-evidence/home-demo/browser-failure.png'});throw error}finally{await browser.close()}
