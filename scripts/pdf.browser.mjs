import assert from 'node:assert/strict'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { DEFAULT_PDF_SYSTEM_PROMPT } from '../src/lib/file-conversion-prompt.ts'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let created, config, mode = 'empty', postCount = 0, tokenCalls = 0, configPatchCount = 0, configListCalls = 0, cancelCount = 0, rerunBody
let uploadMode = 'success', uploadCount = 0
let wakeCount = 0
const heldUploads = new Map()
const multipartUploads = new Map()
const partSize = 32 * 1024 * 1024
let fixtureDirectory
const pdfFile = (name = '讲义.pdf') => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nfixture\n') })
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
await context.route('**/api/file-conversion/wake', async route => {
 assert.equal(route.request().method(), 'POST')
 assert.equal(route.request().headers().authorization, 'Bearer fixture-token')
 assert.equal(route.request().headers()['x-pocketbase-url'], 'https://pb.example.invalid')
 wakeCount++
 await route.fulfill({ status: 202, json: { accepted: true } })
})
await context.route('**/api/library/files/uploads/multipart**', async route => {
 const req = route.request(), url = new URL(req.url())
 assert.equal(req.headers().authorization, 'Bearer fixture-token')
 assert.equal(req.headers()['x-pocketbase-url'], 'https://pb.example.invalid')
 if (url.pathname.endsWith('/multipart')) {
   assert.equal(req.method(), 'POST')
   const current = ++uploadCount, body = req.postDataJSON()
   const gate = uploadMode === 'hold' ? new Promise(resolve => heldUploads.set(current, resolve)) : Promise.resolve()
   multipartUploads.set(current, { ...body, behavior: uploadMode, gate, parts: [], aborted: false })
   return route.fulfill({ status: 201, json: { uploadId: `upload-${current}`, ticket: `ticket-${current}`, partSize } })
 }
 const match = url.pathname.match(/\/multipart\/upload-(\d+)(?:\/(parts\/\d+|complete))?$/u)
 assert.ok(match)
 const current = Number(match[1]), upload = multipartUploads.get(current)
 assert.equal(req.headers()['x-upload-ticket'], `ticket-${current}`)
 if (req.method() === 'DELETE') { upload.aborted = true; return route.fulfill({ status: 204 }) }
 if (match[2]?.startsWith('parts/')) {
   assert.equal(req.method(), 'PUT')
   assert.equal(req.headers()['content-type'], 'application/octet-stream')
   const partNumber = Number(match[2].slice(6)), size = req.postDataBuffer().length
   assert.equal(size, Math.min(partSize, upload.size - (partNumber - 1) * partSize))
   if (partNumber === 1) assert.equal(req.postDataBuffer().subarray(0, 5).toString(), '%PDF-')
   upload.parts.push({ partNumber, size })
   await upload.gate
   try {
     if (upload.behavior === 'failure') return await route.fulfill({ status: 503, json: { message: '临时存储不可用，请稍后重试' } })
     await route.fulfill({ json: { partNumber, etag: `etag-${partNumber}` } })
   } catch { /* The browser may already have cancelled this upload. */ }
   return
 }
 assert.equal(match[2], 'complete')
 assert.deepEqual(req.postDataJSON().parts, Array.from({ length: Math.ceil(upload.size / partSize) }, (_, index) => ({ partNumber: index + 1, etag: `etag-${index + 1}` })))
 try {
   await route.fulfill({ status: 201, json: {
     sourceUrl: `https://ocr-files.any1.tech/fixtures/upload-${current}.pdf`,
     fileName: upload.fileName, size: upload.size,
     expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
   } })
 } catch { /* The browser may already have cancelled this upload. */ }
})
await context.route('https://pb.example.invalid/**', async route => {
 const req = route.request(), url = new URL(req.url())
 if (url.pathname === '/api/files/token') { tokenCalls++; return route.fulfill({ json: { token: 'short-lived' } }) }
 if (url.pathname.startsWith('/api/files/')) { assert.equal(url.searchParams.get('token'), 'short-lived'); return route.fulfill({ body: Buffer.from([80,75,3,4]), contentType: 'application/zip', headers: { 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(`${created.outputName}.zip`) } }) }
 if (url.pathname.includes('/aw_file_conversion_configs/records')) {
   if (req.method() === 'GET' && process.env.CONFIG_LOAD_FAILURE && configListCalls++ < Number(process.env.CONFIG_FAILURE_COUNT || 1)) {
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
   if (body.rerunOf) {
     rerunBody = body
     created = { ...created, id: body.id, rerunOf: body.rerunOf, status: 'queued', cancelRequested: false, file: '', githubRunId: '', created: new Date().toISOString() }
     mode = 'created'; return route.fulfill({ json: created })
   }
   created = { ...body, systemPrompt: config.systemPrompt, outputName: body.outputName || body.title, file: '', githubRunId: '123', status: 'queued', options: { ...config.options, adjacent_pages: Boolean(body.adjacentPages), ...(body.startPage !== undefined ? { start_page: body.startPage } : {}), ...(body.endPage !== undefined ? { end_page: body.endPage } : {}) }, created: new Date().toISOString(), updated: new Date().toISOString() }
   mode = 'created'; return route.fulfill({ json: created })
 }
 if (req.method() === 'PATCH' && url.pathname.includes('/aw_pdf_to_md_jobs/records/')) {
   cancelCount++
   created = { ...created, cancelRequested: true }
   return route.fulfill({ json: created })
 }
 const items = mode === 'empty' ? [] : [{ ...created, ...(mode === 'done' ? { status: 'succeeded', file: 'result.zip', fileSize: 100 } : {}) }]
 return route.fulfill({ json: { items, totalItems: items.length, totalPages: 1, page: 1, perPage: 20 } })
})
try {
 await page.goto((process.env.TEST_BASE_URL || 'http://127.0.0.1:5173') + '/file-converter')
 await page.getByText('暂无转换记录', { exact: true }).waitFor()
 assert.equal(await page.getByRole('tab', { name: '链接', exact: true }).getAttribute('aria-selected'), 'true')
 if (process.env.CONFIG_LOAD_FAILURE) await page.getByText('转换配置未加载', { exact: true }).waitFor()
 else await page.getByText(/^配置 v2 · gemini-3.5-flash-lite · 240 DPI$/u).waitFor()
 await page.getByRole('button', { name: '转换配置', exact: true }).click()
 const sheet = page.getByRole('dialog', { name: '转换配置' })
 await sheet.waitFor()
 await sheet.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))))
 if (process.env.CONFIG_LOAD_FAILURE) await sheet.getByText(/fixture config load failed/u).waitFor()
 assert.equal(await sheet.getByLabel('每次请求页数').count(), 0, 'the deprecated option is not editable')
 const initialPatchCount = configPatchCount
 for (const width of [320, 1440]) {
   await page.setViewportSize({ width, height: 1000 })
   assert.ok(await sheet.evaluate(element => element.getBoundingClientRect().right <= innerWidth + 0.5), `sheet outside viewport ${width}`)
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `sheet overflow ${width}`)
   assert.ok(await sheet.evaluate(element => [...element.querySelectorAll('input, select, textarea, button')]
     .every(control => control.getBoundingClientRect().right <= element.getBoundingClientRect().right + 0.5)), `sheet controls clipped ${width}`)
   assert.ok(await page.locator('#pdf-system-prompt-help').evaluate(element => element.scrollWidth <= element.clientWidth), `prompt help clipped ${width}`)
   if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pdf-config-${width}.png` })
 }
 const promptInput = sheet.getByLabel('系统提示词', { exact: true })
 assert.equal(await promptInput.inputValue(), DEFAULT_PDF_SYSTEM_PROMPT)
 await promptInput.fill('临时草稿')
 await sheet.getByRole('button', { name: '恢复默认', exact: true }).click()
 assert.equal(await promptInput.inputValue(), DEFAULT_PDF_SYSTEM_PROMPT)
 await promptInput.fill('按图片与 OCR 草稿转录，保留脚注和表格。')
 const concurrency = page.getByLabel('并发请求数', { exact: true })
 await concurrency.fill('600')
 await page.getByRole('button', { name: '保存配置', exact: true }).click()
 await page.getByRole('alert').getByText(/并发请求数需填写 1–100 的整数/u).waitFor()
 assert.equal(configPatchCount, initialPatchCount)
 await concurrency.fill('')
 await concurrency.pressSequentially('60')
 assert.equal(await concurrency.inputValue(), '60')
 assert.equal(await page.getByRole('button', { name: '保存配置', exact: true }).isDisabled(), false)
 await page.getByRole('button', { name: '保存配置', exact: true }).click()
 await page.getByText(/配置已保存/u).waitFor()
 assert.equal(configPatchCount, 2)
 assert.equal(config.systemPrompt, '按图片与 OCR 草稿转录，保留脚注和表格。')
 await promptInput.fill('这个未保存的草稿不能进入新任务')
 await concurrency.fill('80')
 await page.keyboard.press('Escape')
 await sheet.waitFor({ state: 'hidden' })
 await page.getByText(/^配置 v3 · /u).waitFor()
 await page.getByLabel('任务名称', { exact: true }).fill('数学讲义')
 await page.getByLabel('PDF 源文件地址').fill('https://example.com/book.pdf')
 await page.getByLabel('产物文件名').fill('数学笔记')
 await page.getByLabel('起始页（可选）').fill('1')
 await page.getByLabel('结束页（可选）').fill('1')
 await page.getByRole('switch', { name: '附带相邻页' }).click()
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
 assert.equal(created.systemPrompt, '按图片与 OCR 草稿转录，保留脚注和表格。')
 assert.equal(created.options.concurrency, 60)
 assert.equal(created.options.start_page, 1)
 assert.equal(created.adjacentPages, true)
 await page.getByText('第 1 页', { exact: true }).waitFor()
 await page.getByText('附带相邻页', { exact: true }).last().waitFor()
 assert.equal(configPatchCount, 2)
 await page.getByRole('button', { name: '结束任务', exact: true }).click()
 await page.getByText('结束中', { exact: true }).waitFor()
 assert.equal(cancelCount, 1)
 mode = 'done'
 await page.getByRole('button', { name: '刷新', exact: true }).click()
 await page.getByText('已完成', { exact: true }).waitFor()
 const originalId = created.id
 const event = page.waitForEvent('download')
 await page.getByRole('button', { name: '下载 ZIP', exact: true }).click()
 assert.equal((await event).suggestedFilename(), '数学笔记.zip')
 assert.equal(tokenCalls, 1)
 await page.getByRole('button', { name: '重跑', exact: true }).click()
 assert.equal(postCount, 2)
 assert.equal(rerunBody.rerunOf, originalId)
 await page.getByLabel('产物文件名（可选）').fill('')
 await page.getByRole('button', { name: '开始转换', exact: true }).click()
 assert.equal(postCount, 3)
 assert.equal(created.outputName, '数学讲义')

 // Local files remain optional: only the generated URL enters the existing PB job contract.
 await page.getByRole('tab', { name: '上传文件', exact: true }).click()
 if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pdf-dropzone-1440.png` })
 const fileInput = page.getByLabel('选择 PDF 文件', { exact: true })
 const submit = page.getByRole('button', { name: '开始转换', exact: true })
 assert.equal(await submit.isDisabled(), true)
 await fileInput.setInputFiles({ name: 'book.txt', mimeType: 'text/plain', buffer: Buffer.from('not a pdf') })
 await page.getByRole('alert').getByText('请选择 PDF 文件', { exact: true }).waitFor()
 assert.equal(uploadCount, 0)

 uploadMode = 'hold'
 const firstRequest = page.waitForRequest('**/api/library/files/uploads/multipart/*/parts/*')
 await fileInput.setInputFiles(pdfFile('old.pdf'))
 await firstRequest
 await page.getByRole('button', { name: '取消上传', exact: true }).waitFor()
 assert.equal(await submit.isDisabled(), true)
 await page.getByRole('button', { name: '取消上传', exact: true }).click()
 assert.equal(await submit.isDisabled(), true)
 assert.equal(await page.getByLabel('上传文件链接', { exact: true }).count(), 0)

 uploadMode = 'success'
 await fileInput.setInputFiles(pdfFile())
 const uploadedLink = page.getByLabel('上传文件链接', { exact: true })
 await uploadedLink.waitFor()
 assert.equal(await uploadedLink.inputValue(), 'https://ocr-files.any1.tech/fixtures/upload-2.pdf')
 heldUploads.get(1)()
 // A cancelled upload that finishes later must not replace a newer file's URL.
 await page.getByText('讲义.pdf', { exact: true }).waitFor()
 await page.getByText(/^已上传 · \d+ B$/u).waitFor()
 assert.equal(await uploadedLink.inputValue(), 'https://ocr-files.any1.tech/fixtures/upload-2.pdf')
 await page.getByRole('button', { name: '复制上传链接', exact: true }).click()
 await page.getByText('链接已复制', { exact: true }).waitFor()

 uploadMode = 'hold'
 const switchingRequest = page.waitForRequest('**/api/library/files/uploads/multipart/*/parts/*')
 await fileInput.setInputFiles(pdfFile('switch.pdf'))
 await switchingRequest
 await page.getByRole('tab', { name: '链接', exact: true }).click()
 heldUploads.get(3)()
 assert.equal(await page.getByLabel('PDF 源文件地址', { exact: true }).inputValue(), 'https://example.com/book.pdf')
 await submit.click()
 assert.equal(postCount, 4)
 assert.equal(created.sourceUrl, 'https://example.com/book.pdf')

 await page.getByRole('tab', { name: '上传文件', exact: true }).click()
 uploadMode = 'failure'
 await fileInput.setInputFiles(pdfFile())
 await page.getByRole('alert').getByText('临时存储不可用，请稍后重试', { exact: true }).waitFor()
 assert.equal(postCount, 4, 'upload failure cannot create a conversion job')
 assert.equal(await submit.isDisabled(), true)
 uploadMode = 'success'
 await fileInput.setInputFiles(pdfFile())
 await uploadedLink.waitFor()
 assert.equal(await uploadedLink.inputValue(), 'https://ocr-files.any1.tech/fixtures/upload-5.pdf')
 for (const colorScheme of ['light', 'dark']) {
   await page.emulateMedia({ colorScheme })
   for (const width of [320,390,760,1440]) {
     await page.setViewportSize({ width, height: 1000 })
     assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `upload overflow ${colorScheme} ${width}`)
     if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pdf-upload-${colorScheme}-${width}.png`, fullPage: true })
   }
 }
 const uploadedJobCreated = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/aw_pdf_to_md_jobs/records'))
 await submit.click()
 await uploadedJobCreated
 assert.equal(postCount, 5)
 assert.equal(created.sourceUrl, 'https://ocr-files.any1.tech/fixtures/upload-5.pdf')
 assert.equal(created.configId, 'config-1')
 assert.equal(created.systemPrompt, '按图片与 OCR 草稿转录，保留脚注和表格。')
 assert.equal('file' in created && created.file !== '', false, 'source PDFs never enter PocketBase files')

 // A real sparse local file above 90 MiB proves the browser sends bounded,
 // concurrent Blob slices rather than one request above Cloudflare's limit.
 fixtureDirectory = await mkdtemp(join(tmpdir(), 'remote-pdf-browser-'))
 const largePath = join(fixtureDirectory, 'large.pdf')
 const largeFile = await open(largePath, 'w')
 const largeSize = partSize * 3 + 17
 await largeFile.truncate(largeSize)
 await largeFile.write('%PDF-1.7\n')
 await largeFile.close()
 uploadMode = 'hold'
 // The POST response can precede the history reload and the fieldset becoming enabled.
 await page.waitForFunction(() => !document.querySelector('#pdf-upload').matches(':disabled'))
 const firstThree = Promise.all([1, 2, 3].map(number => page.waitForRequest(request =>
   request.method() === 'PUT' && new URL(request.url()).pathname.endsWith(`/multipart/upload-6/parts/${number}`))))
 await fileInput.setInputFiles(largePath)
 await firstThree
 assert.equal(await submit.isDisabled(), true)
 assert.equal(multipartUploads.get(6).parts.length, 3, 'three parts start before any response is released')
 heldUploads.get(6)()
 await uploadedLink.waitFor()
 assert.equal(await uploadedLink.inputValue(), 'https://ocr-files.any1.tech/fixtures/upload-6.pdf')
 assert.deepEqual(multipartUploads.get(6).parts.map(part => part.size), [partSize, partSize, partSize, 17])
 const largeJobCreated = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/aw_pdf_to_md_jobs/records'))
 await submit.click()
 await largeJobCreated
 assert.equal(postCount, 6)
 assert.equal(created.sourceUrl, 'https://ocr-files.any1.tech/fixtures/upload-6.pdf')
 await page.waitForFunction(() => !document.querySelector('#pdf-upload').matches(':disabled'))
 assert.ok(wakeCount >= postCount, 'saved jobs wake the Cloudflare dispatcher')
 assert.deepEqual(errors, [])
 console.log('PDF browser: links, multipart/cancel/retry, >90 MiB concurrent slices, job URL contract and responsive themes passed')
} finally {
 for (const release of heldUploads.values()) release()
 await browser.close()
 if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true })
}
