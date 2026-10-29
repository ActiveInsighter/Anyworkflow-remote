// Start links: edited in settings, stored per account, offered by the editor's start-page menu.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const owner = 'owner-links'

try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    const errors = []
    const writes = []
    let record = null
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((owner) => {
      localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({
        token: 'fixture-token', record: { id: owner, email: 'links@example.invalid' }, baseUrl: 'https://pb.example.invalid',
      }))
      window.editorFixtureView = () => {
        const dom = document.querySelector('.cm-content')
        return dom?.cmTile?.root?.view ?? dom?.cmView?.view
      }
    }, owner)
    await page.route('https://pb.example.invalid/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/collections/aw_user_preferences/records')) {
        if (request.method() === 'GET') {
          assert.equal(url.searchParams.get('filter'), `owner="${owner}"`, 'preferences are read for the signed-in owner only')
          return route.fulfill({ json: { page: 1, perPage: 1, items: record ? [record] : [] } })
        }
        const body = request.postDataJSON()
        writes.push({ method: request.method(), path: url.pathname, body })
        record = { id: 'prefs00000000001', ...record, ...body, owner }
        return route.fulfill({ json: record })
      }
      if (url.pathname.includes('runtime-defaults')) {
        return route.fulfill({ json: { owner, schemaVersion: 1, revision: 0, config: { schemaVersion: 1, browser: { replyTimeoutMinutes: 30, randomWait: { enabled: false, minSeconds: 0, maxSeconds: 0 }, deferredReply: { enabled: false, delayMinutes: 10 } } } } })
      }
      if (request.method() !== 'GET') writes.push({ method: request.method(), path: url.pathname })
      return route.fulfill({ json: { page: 1, perPage: 20, totalItems: 0, totalPages: 0, items: [] } })
    })

    // Settings: the defaults are shown until the account saves its own list.
    await page.goto(`${baseUrl}/settings/start-links`)
    const list = page.getByRole('list', { name: '快捷链接' })
    await list.waitFor()
    assert.equal(await list.getByRole('listitem').count(), 5, `${width}px starts from the five default pages`)
    await page.getByRole('button', { name: '添加链接' }).click()
    await page.keyboard.type('内部知识库')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText('请填写以 https:// 开头的完整链接').waitFor()
    assert.equal(writes.length, 0, 'an invalid list is never written')
    await page.getByLabel('第 6 个链接的地址').fill('https://wiki.example.com/space')
    await page.getByRole('button', { name: /删除「ChatGPT 图片界面」/ }).click()
    await page.getByRole('button', { name: /上移「内部知识库」/ }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText('快捷链接已保存').first().waitFor()
    assert.equal(writes.length, 1)
    assert.equal(writes[0].method, 'POST', 'the first save creates the preferences record')
    assert.equal(writes[0].body.owner, owner)
    assert.deepEqual(writes[0].body.startLinks.map((link) => link.label), [
      'ChatGPT 主界面', 'ChatGPT Cloud 界面', 'Claude 主界面', '内部知识库', 'Claude Code 界面',
    ])
    assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true, 'nothing left to save')

    // Editor: the start-page menu sets the Task's start_url from the saved links.
    await page.goto(`${baseUrl}/runs/new`)
    await page.locator('.cm-content').waitFor()
    const readSource = () => page.evaluate(() => window.editorFixtureView().state.doc.toString())
    const placeCursor = (text) => page.evaluate((text) => {
      const view = window.editorFixtureView()
      const at = view.state.doc.toString().indexOf(text)
      view.dispatch({ selection: { anchor: at }, scrollIntoView: true })
      view.focus()
    }, text)
    await placeCursor('在这里写第一条消息')
    await page.getByRole('button', { name: /起始页/ }).click()
    const option = page.getByRole('menuitem', { name: /内部知识库/ })
    await option.waitFor()
    assert.equal(await page.getByRole('menuitem', { name: /ChatGPT 图片界面/ }).count(), 0, 'deleted links are gone from the menu')
    await option.click()
    assert.match(await readSource(), /@let start_url=https:\/\/wiki\.example\.com\/space\n/u)
    await page.locator('.aw-editor-shell').getByText('无问题', { exact: true }).waitFor()

    // A start_url typed by hand can be saved as a new link from the same menu.
    await page.evaluate(() => {
      const view = window.editorFixtureView()
      const doc = view.state.doc.toString()
      const from = doc.indexOf('https://wiki.example.com/space')
      view.dispatch({ changes: { from, to: from + 'https://wiki.example.com/space'.length, insert: 'https://docs.example.org/start' } })
    })
    await placeCursor('在这里写第一条消息')
    await page.getByRole('button', { name: /起始页/ }).click()
    await page.getByRole('menuitem', { name: /添加 docs\.example\.org\/start 到快捷链接/ }).click()
    await page.getByText('已添加到快捷链接').first().waitFor()
    assert.equal(writes.at(-1).method, 'PATCH', 'later saves update the same record')
    assert.equal(writes.at(-1).body.startLinks.at(-1).url, 'https://docs.example.org/start')

    // The runtime config's default start link offers the account's links.
    await page.getByRole('button', { name: '运行配置', exact: true }).click()
    const select = page.getByLabel('默认开始链接', { exact: true })
    await select.waitFor()
    const values = await select.locator('option').evaluateAll((options) => options.map((option) => option.value))
    assert.ok(values.includes('https://docs.example.org/start'), 'default start link options follow the start links')
    await page.getByRole('button', { name: '完成', exact: true }).click()

    // Outline: rows jump to their block.
    if (width >= 1280) {
      await page.getByRole('treeitem', { name: /Event/ }).first().getByRole('button').first().click()
    } else {
      await page.getByRole('button', { name: '结构', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: /^Event/ }).click()
      await page.getByRole('dialog').waitFor({ state: 'detached' })
    }
    await page.waitForFunction(() => {
      const view = window.editorFixtureView()
      return view.state.doc.lineAt(view.state.selection.main.head).text.includes('@event')
    })

    assert.deepEqual(errors, [], `${width}px has no browser exceptions`)
    assert.ok(writes.every((write) => write.path.startsWith('/api/collections/aw_user_preferences/')), 'only preferences were written')
    await context.close()
  }
  console.log('Start links browser: settings CRUD, per-owner storage, editor menu, add-from-plan, runtime options and outline passed')
} finally {
  await browser.close()
}
