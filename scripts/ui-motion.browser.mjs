import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// Exercise real library sheets, with every backend request intercepted.
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const errors = []
const file = {
  id: '00000000-0000-4000-8000-000000000001.pdf', fileName: '动效验证.pdf', size: 1024,
  folder: '', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', expiresAt: '',
  sourceUrl: 'https://files.example.invalid/api/library/sources/00000000-0000-4000-8000-000000000001.pdf',
}

async function capture(page) {
  await page.evaluate(() => {
    window.motionFrames = new Promise(resolve => {
      const frames = [], start = performance.now()
      function tick() {
        const popup = document.querySelector('[data-slot="modal-content"]')
        if (popup) {
          const style = getComputedStyle(popup)
          frames.push({
            y: new DOMMatrixReadOnly(style.transform).m42, opacity: Number(style.opacity),
            title: document.getElementById(popup.getAttribute('aria-labelledby'))?.textContent,
            leaving: popup.hasAttribute('data-ending-style'),
          })
        }
        if (performance.now() - start < 550) requestAnimationFrame(tick)
        else resolve(frames)
      }
      requestAnimationFrame(tick)
    })
  })
}

try {
  for (const width of [320, 390, 760, 1440]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      console.log(`Checking ${width}px ${reducedMotion}`)
      const context = await browser.newContext({
        viewport: { width, height: 900 }, reducedMotion,
        colorScheme: width === 390 || width === 1440 ? 'dark' : 'light',
      })
      await context.addInitScript(() => localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({
        token: 'fixture-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid',
      })))
      await context.route('https://pb.example.invalid/**', route => route.fulfill({ json: { items: [], totalPages: 1, totalItems: 0 } }))
      await context.route('**/api/library/**', route => {
        const path = new URL(route.request().url()).pathname
        return route.fulfill({ json: path.endsWith('/import')
          ? { done: true, unavailable: 0 }
          : { items: path.endsWith('/files') ? [file] : [], cursor: '' } })
      })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${base}/library`)
      const trigger = page.getByRole('button', { name: '更多操作：动效验证.pdf', exact: true })
      await trigger.waitFor()
      await capture(page)
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: '重命名', exact: true }).waitFor()
      const frames = await page.evaluate(() => window.motionFrames)
      assert.ok(frames.length > 3, `sampled entrance at ${width}`)
      if (reducedMotion === 'reduce') assert.ok(frames.every(frame => Math.abs(frame.y) < 0.5), 'reduced motion keeps the sheet stationary')
      else assert.ok(frames.some(frame => frame.y > 1 && frame.opacity > 0 && frame.opacity < 1), 'entrance has visible intermediate motion')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow ${width}`)
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), `sheet overflow ${width}`)

      // A nested page shares one popup/backdrop, traps focus and returns it on Esc.
      const rename = dialog.getByRole('button', { name: '重命名', exact: true })
      await rename.click()
      const input = dialog.getByLabel('文件名', { exact: true })
      await input.fill('保留草稿')
      const draft = await input.inputValue()
      assert.ok(draft.startsWith('保留草稿'))
      assert.equal(await page.locator('[data-slot="modal-content"]').count(), 1)
      assert.equal(await page.locator('[data-slot="modal-backdrop"]').count(), 1)
      assert.ok(await input.evaluate(el => el.closest('[data-slot="modal-content"]').contains(document.activeElement)))
      await page.emulateMedia({ reducedMotion: reducedMotion === 'reduce' ? 'no-preference' : 'reduce' })
      assert.equal(await input.inputValue(), draft, 'changing motion preference preserves page state')
      await page.keyboard.press('Escape')
      await rename.waitFor()
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === '重命名')
      await rename.click()
      await input.waitFor()
      assert.equal(await input.inputValue(), draft, 'returning to a page preserves its draft')

      // Closing from a child must not expose the parent in its exit frames.
      await capture(page)
      await dialog.getByRole('button', { name: '全部关闭', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      const exit = await page.evaluate(() => window.motionFrames)
      assert.ok(exit.filter(frame => frame.leaving && frame.opacity > 0.05).every(frame => frame.title === '重命名'), 'parent stays hidden during dismissal')
      await trigger.click()
      await rename.waitFor()
      assert.equal(await dialog.getByRole('button', { name: '返回', exact: true }).count(), 0, 'reopening starts at the root page')
      if (process.env.SCREENSHOT_DIR) {
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/ui-motion-${width}-${reducedMotion}.png` })
      }
      await dialog.getByRole('button', { name: '关闭', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })

      // Interrupt the entrance with Esc, then reopen without a stuck focus trap.
      await trigger.click()
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await trigger.click()
      await rename.waitFor()
      if (reducedMotion === 'no-preference') {
        const header = await page.locator('[data-slot="modal-header"]').boundingBox()
        await page.mouse.move(header.x + header.width / 2, header.y + 6)
        await page.mouse.down()
        await page.mouse.move(header.x + header.width / 2, header.y + 400, { steps: 15 })
        await page.mouse.up()
        await dialog.waitFor({ state: 'hidden' })
      }
      await context.close()
    }
  }
  assert.deepEqual(errors, [])
  console.log('UI motion: intermediate frames, reduced motion, one Drawer, nested focus/drafts, interrupted dismissal, swipe and 320–1440px passed')
} finally {
  await browser.close()
}
