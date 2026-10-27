import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const errors = []
page.on('pageerror', error => errors.push(error.message))
const now = new Date().toISOString()
const run = (id, title) => ({ id, owner: 'owner-1', title, status: 'succeeded', requestedAction: 'none', planText: '', created: now, updated: now })
const store = {
  aw_library_folders: [
    { id: 'tplfolder000001', owner: 'owner-1', parent: '', name: '写作', scope: 'template', sortOrder: 0, created: now, updated: now },
    { id: 'favfolder000001', owner: 'owner-1', parent: '', name: '每日任务', scope: 'favorite', sortOrder: 0, created: now, updated: now },
  ],
  aw_run_favorites: [
    { id: 'favorite0000001', owner: 'owner-1', folder: '', run: 'run000000000001', note: '', sortOrder: 0, created: now, updated: now, expand: { run: run('run000000000001', '每日新闻摘要') } },
  ],
  aw_templates: [
    { id: 'template0000001', owner: 'owner-1', folder: '', title: '长文改写', description: '', planText: '@task a', sourceRun: '', tags: ['写作'], sortOrder: 0, created: now, updated: now },
  ],
}
let created = 0
await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })))
await context.route('https://pb.example.invalid/**', async route => {
  const req = route.request(), url = new URL(req.url())
  const match = /^\/api\/collections\/([^/]+)\/records(?:\/([^/]+))?$/u.exec(url.pathname)
  const rows = match && store[match[1]]
  if (!rows) return route.fulfill({ json: { items: [], page: 1, perPage: 200, totalPages: 1, totalItems: 0 } })
  const id = match[2]
  if (req.method() === 'POST') {
    const row = { id: `created${String(++created).padStart(8, '0')}`, ...req.postDataJSON(), created: now, updated: now }
    rows.push(row)
    return route.fulfill({ json: row })
  }
  if (req.method() === 'PATCH') {
    const row = rows.find(item => item.id === id)
    Object.assign(row, req.postDataJSON())
    return route.fulfill({ json: row })
  }
  if (req.method() === 'DELETE') {
    store[match[1]] = rows.filter(item => item.id !== id)
    return route.fulfill({ status: 204 })
  }
  if (id) return route.fulfill({ json: rows.find(item => item.id === id) })
  return route.fulfill({ json: { items: rows, page: 1, perPage: 200, totalPages: 1, totalItems: rows.length } })
})
const more = name => page.getByRole('button', { name: `更多操作：${name}`, exact: true })
const sheet = page.getByRole('dialog')
try {
  await page.goto(`${base}/favorites-and-templates`)
  await more('每日新闻摘要').waitFor()
  await page.getByRole('button', { name: '每日任务', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '写作', exact: true }).count(), 0, 'each tab shows its own folders')

  // Move the favorite into a folder from its sheet, then follow it there.
  await more('每日新闻摘要').click()
  await sheet.getByRole('link', { name: '打开 Run', exact: true }).waitFor()
  await sheet.getByRole('button', { name: '移动', exact: true }).click()
  await sheet.getByRole('button', { name: '每日任务', exact: true }).click()
  await sheet.getByRole('button', { name: '移到「每日任务」', exact: true }).click()
  await sheet.waitFor({ state: 'hidden' })
  assert.equal(store.aw_run_favorites[0].folder, 'favfolder000001')
  await more('每日新闻摘要').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '每日任务', exact: true }).click()
  await more('每日新闻摘要').waitFor()
  await page.getByRole('heading', { name: /每日任务/u }).waitFor()
  await page.goBack()
  await page.getByRole('button', { name: '每日任务', exact: true }).waitFor()

  // Templates: rename, a new folder from the floating button, and delete that folder.
  await page.getByRole('tab', { name: '模板', exact: true }).click()
  await more('长文改写').click()
  await sheet.getByRole('link', { name: '使用模板', exact: true }).waitFor()
  await sheet.getByRole('button', { name: '重命名', exact: true }).click()
  await sheet.getByLabel('模板名称', { exact: true }).fill('长文改写 v2')
  await sheet.getByRole('button', { name: '保存', exact: true }).click()
  await more('长文改写 v2').waitFor()
  assert.equal(store.aw_templates[0].title, '长文改写 v2')

  await page.getByRole('button', { name: '新建文件夹', exact: true }).click()
  await sheet.getByLabel('文件夹名称', { exact: true }).fill('归档')
  await sheet.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '归档', exact: true }).waitFor()
  assert.equal(store.aw_library_folders.at(-1).scope, 'template')
  await more('长文改写 v2').click()
  await sheet.getByRole('button', { name: '移动', exact: true }).click()
  await sheet.getByRole('button', { name: '归档', exact: true }).click()
  await sheet.getByRole('button', { name: '移到「归档」', exact: true }).click()
  await sheet.waitFor({ state: 'hidden' })
  await more('归档').click()
  await sheet.getByRole('button', { name: '删除', exact: true }).click()
  await sheet.getByRole('button', { name: '删除文件夹', exact: true }).click()
  await more('长文改写 v2').waitFor()
  assert.equal(store.aw_templates[0].folder, '', 'templates in a deleted folder move up a level')

  await page.getByRole('searchbox', { name: '搜索模板', exact: true }).fill('v2')
  await more('长文改写 v2').waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow')

  // Unfavorite from the sheet.
  await page.getByRole('tab', { name: '收藏', exact: true }).click()
  await page.getByRole('button', { name: '每日任务', exact: true }).click()
  await more('每日新闻摘要').click()
  await sheet.getByRole('button', { name: '取消收藏', exact: true }).click()
  await page.getByText('文件夹是空的', { exact: true }).waitFor()
  assert.equal(store.aw_run_favorites.length, 0)
  assert.deepEqual(errors, [])
  console.log('Favorites browser: folders per tab, sheet move/rename/unfavorite, floating new folder, folder delete and history navigation passed')
} finally { await browser.close() }
