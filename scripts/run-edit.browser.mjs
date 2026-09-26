// Vite or TEST_BASE_URL; uses only an isolated mock API, never production records.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const errors = []
page.on('pageerror', error => errors.push(error.message))
const planText = '@run=编辑已完成的工作流\n@task Task {\n@event Event {\n{ hello }\n}\n}'
const original = { id: 'parent', owner: 'owner-1', title: '编辑已完成的工作流', planText, familyId: 'parent', parentRun: '', origin: 'initial', status: 'succeeded', versionNumber: 1, versionMajor: 1, versionMinor: 0, requestedAction: 'none', completedTasks: 0, totalTasks: 0, executionMode: 'serial', scheduledAt: '2026-01-01T00:00:00Z', updated: '2026-09-26T14:00:00Z' }
const records = new Map([['parent', original]])
const writes = []
await page.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({ token: 'fixture-token', record: { id: 'owner-1', email: 'test@example.invalid' }, baseUrl: 'https://pb.example.invalid' })))
await page.route('https://pb.example.invalid/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  const collection = url.pathname.split('/')[3]
  const id = url.pathname.split('/')[5]
  if (request.method() !== 'GET') {
    const data = request.postDataJSON()
    writes.push({ method: request.method(), id, data })
    const saved = request.method() === 'POST'
      ? { ...data, familyId: 'parent', versionNumber: records.size + 1, versionMajor: records.size + 1, versionMinor: 0, updated: original.updated }
      : { ...records.get(id), ...data }
    records.set(saved.id, saved)
    return route.fulfill({ json: saved })
  }
  if (collection === 'aw_dispatch_runs' && id) return route.fulfill({ json: records.get(id) })
  const items = collection === 'aw_dispatch_runs' ? [...records.values()] : []
  await route.fulfill({ json: { page: 1, perPage: 20, totalItems: items.length, totalPages: 1, items } })
})
async function replaceSource(text) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(text)
}
try {
  await page.goto(`${baseUrl}/runs/parent`)
  await page.getByRole('link', { name: '编辑', exact: true }).click()
  await page.locator('.cm-content').waitFor()
  assert.equal(writes.length, 0, 'entering the editor must not create a draft')
  await page.getByText('未保存', { exact: true }).waitFor()
  await replaceSource(planText + '\n# 仅保存在浏览器')
  await page.waitForTimeout(600)
  assert.equal(writes.length, 0)
  await page.reload()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  assert.ok((await page.locator('.cm-content').innerText()).includes('仅保存在浏览器'))
  // Even an unchanged edit starts a new major; no past schedule is inherited.
  await replaceSource(planText)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.waitForURL(/\/runs\/[a-z0-9]{15}$/)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].method, 'POST')
  assert.equal(writes[0].data.origin, 'edited_rerun')
  assert.equal(writes[0].data.parentRun, 'parent')
  assert.equal(writes[0].data.status, 'queued')
  assert.equal(writes[0].data.scheduledAt, undefined)
  assert.equal(records.get('parent'), original)
  await page.goto(`${baseUrl}/runs/parent/edit`)
  await page.locator('.cm-content').waitFor()
  assert.equal(await page.getByRole('button', { name: '恢复', exact: true }).count(), 0, 'saved local draft is cleared')
  await page.getByRole('button', { name: '保存', exact: true }).last().click()
  await page.waitForURL(/\/runs\/[a-z0-9]{15}\/edit$/)
  const draftId = writes.at(-1).data.id
  await page.getByText('已保存', { exact: true }).waitFor()
  assert.equal(records.get(draftId).status, 'draft')
  await replaceSource(planText + '\n# 保存草稿后继续编辑')
  await page.getByRole('button', { name: '保存', exact: true }).last().click()
  await page.getByText('已保存', { exact: true }).waitFor()
  assert.equal(writes.at(-1).method, 'PATCH')
  assert.equal(writes.at(-1).id, draftId)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.waitForURL(`${baseUrl}/runs/${draftId}`)
  assert.equal(writes.at(-1).method, 'PATCH')
  assert.equal(writes.at(-1).data.status, 'queued')
  assert.equal(records.get(draftId).versionMajor, 3)
  const count = writes.length
  await page.goto(`${baseUrl}/runs/${draftId}/edit`)
  await page.getByText('进行中的 Run 不能编辑，请等待执行结束').waitFor()
  assert.equal(await page.locator('.cm-content').count(), 0)
  assert.equal(writes.length, count)
  assert.deepEqual(errors, [])
  console.log('PASS: completed-run edit, no eager writes, local restore, unchanged direct run, draft save/update/publish, immutable source, active-run guard')
} finally { await browser.close() }
