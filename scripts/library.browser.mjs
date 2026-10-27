import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const errors = []
page.on('pageerror', error => errors.push(error.message))
let files = [], folders = [], uploads = 0, config, deleteFailure = false
const jobs = [], sessions = new Map()
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
await context.route('**/api/library/folders**', async route => {
  const req = route.request(), url = new URL(req.url())
  if (url.pathname === '/api/library/folders') {
    if (req.method() === 'POST') {
      const folder = { id: `00000000-0000-4000-9000-${String(folders.length + 1).padStart(12, '0')}`, ...req.postDataJSON(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      folders.push(folder)
      return route.fulfill({ status: 201, json: folder })
    }
    return route.fulfill({ json: { items: folders } })
  }
  const id = url.pathname.split('/').at(-1)
  if (req.method() === 'DELETE') {
    const folder = folders.find(row => row.id === id)
    folders = folders.filter(row => row.id !== id)
    files = files.map(file => file.folder === id ? { ...file, folder: folder.parent } : file)
    return route.fulfill({ status: 204 })
  }
  folders = folders.map(row => row.id === id ? { ...row, ...req.postDataJSON(), updatedAt: new Date().toISOString() } : row)
  return route.fulfill({ json: folders.find(row => row.id === id) })
})
await context.route('**/api/library/files**', async route => {
  const req = route.request(), url = new URL(req.url())
  assert.equal(req.headers().authorization, 'Bearer fixture-token')
  assert.equal(req.headers()['x-pocketbase-url'], 'https://pb.example.invalid')
  if (url.pathname.endsWith('/import')) return route.fulfill({ json: { done: true, unavailable: 0 } })
  if (url.pathname.endsWith('/uploads/multipart')) {
    const id = ++uploads
    sessions.set(`upload-${id}`, req.postDataJSON())
    return route.fulfill({ status: 201, json: { uploadId: `upload-${id}`, ticket: `ticket-${id}`, partSize: 32 * 1024 * 1024 } })
  }
  if (url.pathname.includes('/parts/')) return route.fulfill({ json: { partNumber: 1, etag: 'part-1' } })
  if (url.pathname.endsWith('/complete')) {
    const upload = sessions.get(url.pathname.split('/').at(-2))
    const id = `00000000-0000-4000-8000-${String(uploads).padStart(12, '0')}.pdf`
    const file = { ...upload, id, sourceUrl: `https://files.example.invalid/api/library/sources/${id}`, expiresAt: '', createdAt: new Date().toISOString() }
    files.push(file)
    return route.fulfill({ status: 201, json: file })
  }
  if (url.pathname === '/api/library/files') return route.fulfill({ json: { items: files, cursor: '' } })
  const file = files.find(file => file.id === decodeURIComponent(url.pathname.split('/').at(-1)))
  if (!file) return route.fulfill({ status: 404, json: { message: '文件已删除或不存在' } })
  if (req.method() === 'PATCH') {
    Object.assign(file, req.postDataJSON(), { updatedAt: new Date().toISOString() })
    return route.fulfill({ json: file })
  }
  if (req.method() === 'DELETE') {
    if (deleteFailure) return route.fulfill({ status: 503, json: { message: '暂时无法删除，请重试' } })
    files = files.filter(row => row.id !== file.id)
    return route.fulfill({ status: 204 })
  }
  return route.fulfill({ json: file })
})
await context.route('**/api/file-conversion/wake', route => route.fulfill({ status: 202, json: { accepted: true } }))
await context.route('https://pb.example.invalid/**', async route => {
  const req = route.request(), url = new URL(req.url())
  if (url.pathname.includes('/aw_file_conversion_configs/records')) {
    config ??= { id: 'config-1', owner: 'owner-1', conversionType: 'pdf_to_md', name: '默认配置', revision: 1, options: { concurrency: 5, dpi: 240, jpeg_quality: 95, verification_passes: 0, rpm_per_key: 15, rpd_per_key: 500, thinking_level: 'high', image_format: 'png', media_resolution: 'ultra_high', model: 'gemini-3.5-flash-lite' } }
    if (req.method() === 'PATCH') { config = { ...config, ...req.postDataJSON(), revision: config.revision + 1 }; return route.fulfill({ json: config }) }
    return route.fulfill({ json: { items: [config], totalPages: 1, totalItems: 1 } })
  }
  if (url.pathname.includes('/aw_pdf_to_md_jobs/records')) {
    if (req.method() === 'POST') {
      const job = { ...req.postDataJSON(), status: 'queued', options: config.options, created: new Date().toISOString(), updated: new Date().toISOString() }
      jobs.unshift(job)
      return route.fulfill({ json: job })
    }
    return route.fulfill({ json: { items: jobs, totalPages: 1, totalItems: jobs.length } })
  }
  return route.fulfill({ json: { items: [], totalPages: 1, totalItems: 0 } })
})
try {
  const more = name => page.getByRole('button', { name: `更多操作：${name}`, exact: true })
  const sheet = page.getByRole('dialog')
  await page.goto(`${base}/library`)
  await page.getByText('资料库是空的', { exact: true }).waitFor()
  await page.getByRole('link', { name: '收藏和模板', exact: true }).waitFor()
  const pdf = { name: '数学讲义.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nreusable\n%%EOF') }
  await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles(pdf)
  await page.getByText('已完成 1 项上传', { exact: true }).waitFor()
  await more(pdf.name).waitFor()
  assert.equal(uploads, 1)
  await page.getByRole('button', { name: '关闭上传提示', exact: true }).click()
  await page.reload()
  await more(pdf.name).click()
  await sheet.getByRole('link', { name: '转换为 Markdown', exact: true }).click()
  await page.getByLabel('资料库文件', { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('#library-file')?.value !== '')
  const firstSource = files[0].sourceUrl
  await page.getByLabel('任务名称', { exact: true }).fill('第一份转换')
  const submit = page.getByRole('button', { name: '开始转换', exact: true })
  await submit.click()
  await page.getByText('第一份转换', { exact: true }).last().waitFor()
  await page.waitForFunction(() => !document.querySelector('#pdf-title').matches(':disabled'))
  await page.getByLabel('任务名称', { exact: true }).fill('不同要求再次转换')
  await page.getByLabel('转换要求（可选）').fill('保留表格')
  await submit.click()
  await page.getByText('不同要求再次转换', { exact: true }).last().waitFor()
  assert.equal(jobs.length, 2)
  assert.equal(jobs[0].sourceUrl, firstSource)
  assert.equal(jobs[1].sourceUrl, firstSource)
  assert.equal(uploads, 1, 'different jobs reuse one upload')

  await page.getByRole('tab', { name: '上传文件', exact: true }).click()
  await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles({ ...pdf, name: '来自转换页的文件.pdf' })
  await page.getByLabel('上传文件链接', { exact: true }).waitFor()
  await page.goto(`${base}/library`)
  await more('来自转换页的文件.pdf').waitFor()
  assert.equal(files.length, 2, 'conversion-page uploads are saved in the library')
  await page.getByRole('searchbox', { name: '在资料库中搜索', exact: true }).fill('来自转换页')
  await more('来自转换页的文件.pdf').waitFor()
  assert.equal(await more(pdf.name).count(), 0)
  await page.getByRole('button', { name: '清空搜索', exact: true }).click()
  await more(pdf.name).waitFor()

  // Folders: create, move a file in through the sheet, open it, rename the file inside.
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '新建文件夹', exact: true }).click()
  await sheet.getByLabel('文件夹名称', { exact: true }).fill('讲义')
  await sheet.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '讲义', exact: true }).waitFor()
  await more(pdf.name).click()
  await sheet.getByRole('button', { name: '移动', exact: true }).click()
  await sheet.getByRole('button', { name: '讲义', exact: true }).click()
  await sheet.getByRole('button', { name: '移到「讲义」', exact: true }).click()
  await sheet.waitFor({ state: 'hidden' })
  assert.equal(files.find(file => file.fileName === pdf.name).folder, folders[0].id)
  assert.equal(await more(pdf.name).count(), 0, 'a moved file leaves the root listing')
  await page.getByRole('button', { name: '讲义', exact: true }).click()
  await page.waitForURL(`**/library?folder=${folders[0].id}`)
  await more(pdf.name).click()
  await sheet.getByRole('button', { name: '重命名', exact: true }).click()
  await sheet.getByLabel('文件名', { exact: true }).fill('高数讲义') // focus selects the name without .pdf
  await sheet.getByRole('button', { name: '保存', exact: true }).click()
  await more('高数讲义.pdf').waitFor()
  assert.equal(files.find(file => file.folder === folders[0].id).fileName, '高数讲义.pdf')
  await page.goBack()
  await page.waitForURL(/\/library$/u)
  await more('来自转换页的文件.pdf').waitFor()
  await page.getByRole('radio', { name: '网格视图', exact: true }).click()
  await more('讲义').waitFor()
  await page.getByRole('radio', { name: '列表视图', exact: true }).click()

  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `library overflow ${colorScheme} ${width}`)
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/library-${colorScheme}-${width}.png`, fullPage: true })
    }
  }

  // Delete keeps the sheet open on failure, so the user can retry.
  const target = '来自转换页的文件.pdf'
  await more(target).click()
  await sheet.getByRole('button', { name: '删除', exact: true }).click()
  await sheet.getByRole('button', { name: '取消', exact: true }).click()
  await sheet.getByRole('button', { name: '删除', exact: true }).click()
  deleteFailure = true
  await sheet.getByRole('button', { name: '确认删除', exact: true }).click()
  await sheet.getByText(/暂时无法删除，请重试/u).waitFor()
  assert.equal(files.length, 2)
  deleteFailure = false
  await sheet.getByRole('button', { name: '确认删除', exact: true }).click()
  await sheet.waitFor({ state: 'hidden' })
  assert.equal(files.length, 1)
  assert.equal(jobs.length, 2, 'source deletion leaves existing job records intact')
  await page.reload()
  await page.getByRole('button', { name: '讲义', exact: true }).waitFor()
  assert.equal(await more(target).count(), 0)

  // Deleting a folder brings its files back up a level.
  await more('讲义').click()
  await sheet.getByRole('button', { name: '删除', exact: true }).click()
  await sheet.getByRole('button', { name: '删除文件夹', exact: true }).click()
  await more('高数讲义.pdf').waitFor()
  assert.equal(folders.length, 0)

  await page.goto(`${base}/library?tab=templates`)
  await page.waitForURL('**/favorites-and-templates?tab=templates')
  await page.getByRole('tab', { name: '模板', exact: true }).waitFor()
  await page.getByText('暂无模板', { exact: true }).waitFor()
  await page.getByRole('tab', { name: '收藏', exact: true }).click()
  await page.getByText('暂无收藏', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Library browser: uploads, sheet actions, folders, move/rename, delete retry, legacy navigation, light/dark and 320–1440px passed')
} finally { await browser.close() }
