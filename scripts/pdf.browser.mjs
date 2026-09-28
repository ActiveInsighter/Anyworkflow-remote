import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let created, config, mode = 'empty', postCount = 0, tokenCalls = 0, configPatchCount = 0, configListCalls = 0
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
await context.route('https://pb.example.invalid/**', async route => {
 const req = route.request(), url = new URL(req.url())
 if (url.pathname === '/api/files/token') { tokenCalls++; return route.fulfill({ json: { token: 'short-lived' } }) }
 if (url.pathname.startsWith('/api/files/')) { assert.equal(url.searchParams.get('token'), 'short-lived'); return route.fulfill({ body: Buffer.from([80,75,3,4]), contentType: 'application/zip' }) }
 if (url.pathname.includes('/aw_file_conversion_configs/records')) {
   if (req.method() === 'GET' && process.env.CONFIG_LOAD_FAILURE && configListCalls++ < 1) {
     return route.fulfill({ status: 503, json: { message: 'fixture config load failed' } })
   }
   if (req.method() === 'PATCH') {
     configPatchCount++
     config = { ...config, ...req.postDataJSON(), revision: config.revision + 1 }
     return route.fulfill({ json: config })
   }
   config = config || { id: 'config-1', owner: 'owner-1', conversionType: 'pdf_to_md', name: '默认配置', revision: 1, options: { images_per_request: 1, concurrency: 5, dpi: 240, jpeg_quality: 95, verification_passes: 0, rpm_per_key: 15, rpd_per_key: 500, thinking_level: 'high', image_format: 'png', media_resolution: 'ultra_high', model: 'gemini-3.5-flash-lite' } }
   return route.fulfill({ json: { items: [config], totalItems: 1, totalPages: 1, page: 1, perPage: 20 } })
 }
 if (req.method() === 'POST' && url.pathname.includes('/aw_pdf_to_md_jobs/records')) {
   postCount++
   const body = req.postDataJSON()
   created = { ...body, file: '', githubRunId: '123', status: 'queued', options: { ...config.options, ...(body.startPage !== undefined ? { start_page: body.startPage } : {}), ...(body.endPage !== undefined ? { end_page: body.endPage } : {}) }, created: new Date().toISOString(), updated: new Date().toISOString() }
   mode = 'created'; return route.fulfill({ json: created })
 }
 const items = mode === 'empty' ? [] : [{ ...created, ...(mode === 'done' ? { status: 'succeeded', file: 'result.zip', fileSize: 100 } : {}) }]
 return route.fulfill({ json: { items, totalItems: items.length, totalPages: 1, page: 1, perPage: 20 } })
})
try {
 await page.goto((process.env.TEST_BASE_URL || 'http://127.0.0.1:5173') + '/file-converter')
 await page.getByText('暂无转换记录', { exact: true }).waitFor()
 if (process.env.CONFIG_LOAD_FAILURE) await page.getByText(/fixture config load failed/u).waitFor()
 else await page.getByText(/配置已加载/u).waitFor()
 await page.getByText(/高级参数/u).click()
 const imagesPerRequest = page.getByLabel('每次请求页数', { exact: true })
 await imagesPerRequest.fill('')
 await imagesPerRequest.pressSequentially('1')
 assert.equal(await imagesPerRequest.inputValue(), '1')
 const concurrency = page.getByLabel('并发请求数', { exact: true })
 await concurrency.fill('')
 await concurrency.pressSequentially('10')
 assert.equal(await concurrency.inputValue(), '10')
 assert.equal(await page.getByRole('button', { name: '保存配置', exact: true }).isDisabled(), false)
 await page.getByRole('button', { name: '保存配置', exact: true }).click()
 await page.getByText(/配置已保存/u).waitFor()
 assert.equal(configPatchCount, 1)
 await page.getByLabel('任务名称', { exact: true }).fill('数学讲义')
 await page.getByLabel('PDF 源文件地址').fill('https://example.com/book.pdf')
 await page.getByLabel('产物文件名').fill('数学笔记')
 await page.getByLabel('起始页（可选）').fill('1')
 await page.getByLabel('结束页（可选）').fill('1')
 for (const width of [320,390,760,1440]) {
   await page.setViewportSize({ width, height: 1000 })
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`)
   if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pdf-${width}.png`, fullPage: true })
 }
 await page.getByRole('button', { name: '开始转换', exact: true }).click()
 await page.getByText('等待调度', { exact: true }).waitFor()
 assert.equal(postCount, 1)
assert.equal(created.outputName, '数学笔记')
 assert.equal(created.configId, 'config-1')
 assert.equal(created.options.concurrency, 10)
 assert.equal(created.options.start_page, 1)
 assert.equal(configPatchCount, 1)
 mode = 'done'
 await page.getByRole('button', { name: '刷新', exact: true }).click()
 await page.getByText('已完成', { exact: true }).waitFor()
 const event = page.waitForEvent('download')
 await page.getByRole('button', { name: '下载 ZIP', exact: true }).click()
 assert.equal((await event).suggestedFilename(), '数学笔记.zip')
 assert.equal(tokenCalls, 1)
 assert.deepEqual(errors, [])
 console.log('PDF browser: submit, options, states, protected download and 320/390/760/1440 layouts passed')
} finally { await browser.close() }
