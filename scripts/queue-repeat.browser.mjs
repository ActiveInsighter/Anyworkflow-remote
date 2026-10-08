// Uses isolated mock API responses; never submits a Run.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5197'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

try {
  for (const width of [320, 390, 760, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    const errors = []
    const writes = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({
        token: 'fixture-token', record: { id: 'owner-repeat', email: 'repeat@example.invalid' },
        baseUrl: 'https://pb.example.invalid',
      }))
    })
    await page.route('https://pb.example.invalid/**', async route => {
      if (route.request().method() !== 'GET') writes.push(route.request().method())
      if (new URL(route.request().url()).pathname === '/api/anyworkflow/runtime-defaults') {
        return route.fulfill({ json: {
          owner: 'owner-repeat', schemaVersion: 1, revision: 1,
          config: { schemaVersion: 1, browser: {
            replyTimeoutMinutes: 30,
            randomWait: { enabled: false, minSeconds: 1, maxSeconds: 10 },
            deferredReply: { enabled: false, delayMinutes: 10 },
          } },
        } })
      }
      await route.fulfill({ json: { page: 1, perPage: 20, totalItems: 0, totalPages: 0, items: [] } })
    })
    await page.goto(`${baseUrl}/runs/new`)
    await page.locator('.cm-content').waitFor()

    for (const executor of ['@task', '@Codex']) {
      for (const count of [1, 50, 100, 0, 101]) {
        const source = `@run=循环次数验证\n${executor} T {\n@event E {\n{ 继续整理 }*${count}\n}\n}`
        await page.locator('.cm-content').click()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.insertText(source)
        const save = page.getByRole('button', { name: /^保存/ }).last()
        const run = page.getByRole('button', { name: '运行', exact: true })
        if (count >= 1 && count <= 100) {
          await page.locator('.aw-editor-shell').getByText('无问题', { exact: true }).waitFor()
          await save.waitFor()
          assert.equal(await save.isEnabled(), true, `${width}px ${executor} *${count} allows save`)
          assert.equal(await run.isEnabled(), true, `${width}px ${executor} *${count} allows run`)
        } else {
          const issues = page.locator('.aw-editor-shell').getByRole('button', { name: /1 个错误/ })
          await issues.waitFor()
          if (await issues.getAttribute('aria-expanded') === 'false') await issues.click()
          await page.getByText(/的重复次数必须是 1–100/).first().waitFor()
          assert.equal(await save.isEnabled(), false, `${width}px *${count} blocks save`)
          assert.equal(await run.isEnabled(), false, `${width}px *${count} blocks run`)
        }
      }
    }
    assert.deepEqual(errors, [], `${width}px has no browser exceptions`)
    assert.deepEqual(writes, [], `${width}px validation does not write backend data`)
    await context.close()
    console.log(`queue repeat editor verification passed at ${width}px`)
  }
} finally {
  await browser.close()
}
