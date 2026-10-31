// Runs against Vite, a preview, or production; all API requests use an isolated mock owner.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'
const screenshotDir = process.env.SCREENSHOT_DIR
if (screenshotDir) await mkdir(screenshotDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

const message = '      {\n        hello\n      }*2\n'
const act = `    @act {\n${message}    }\n`
const loop = '    @for i in range(1, 3) {\n      { next %i% }\n    }\n'
const event = `  @event E {\n${act}${loop}  }\n`
const task = `@task First {\n  @mode=serial\n  @let name=existing\n\n${event}}\n`
const secondTask = '@task Second {\n  @mode=serial\n  @event Prompt {\n    { world }\n  }\n}\n'
const source = `@run=Editor regression\n${task}${secondTask}`

try {
  for (const width of [320, 390, 760, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin })
    const page = await context.newPage()
    const errors = []
    const writes = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('anyworkflow.auth.session.v1', JSON.stringify({
        token: 'fixture-token', record: { id: 'owner-editor', email: 'editor@example.invalid' },
        baseUrl: 'https://pb.example.invalid',
      }))
      // A test-only adapter sets exact selections without depending on visual line wrapping.
      window.editorFixtureView = () => {
        const dom = document.querySelector('.cm-content')
        return dom?.cmTile?.root?.view ?? dom?.cmView?.view
      }
    })
    await page.route('https://pb.example.invalid/**', async route => {
      if (route.request().method() !== 'GET') writes.push(route.request().method())
      await route.fulfill({ json: { page: 1, perPage: 20, totalItems: 0, totalPages: 0, items: [] } })
    })
    await page.goto(`${baseUrl}/runs/new`)
    await page.locator('.cm-content').waitFor()

    const readSource = () => page.evaluate(() => window.editorFixtureView().state.doc.toString())
    const selection = () => page.evaluate(() => {
      const view = window.editorFixtureView()
      const range = view.state.selection.main
      return view.state.doc.sliceString(range.from, range.to)
    })
    const select = async (from, to = from) => {
      await page.evaluate(({ from, to }) => {
        const view = window.editorFixtureView()
        view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true })
        view.focus()
      }, { from, to })
    }
    const replace = async text => {
      await page.locator('.cm-content').click()
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.insertText(text)
    }
    const copyButton = () => page.getByRole('button', { name: '复制', exact: true })
    const deleteButton = () => page.getByRole('button', { name: '删除', exact: true })
    const editorFocused = () => page.evaluate(() => document.activeElement?.classList.contains('cm-content') ?? false)
    // The 循环 tool is a popover of templates; it opens without taking focus from the text.
    const insertLoop = async (template = '数字循环') => {
      await page.getByRole('button', { name: '循环', exact: true }).click()
      const item = page.getByRole('button', { name: new RegExp(`^${template}`) })
      await item.waitFor()
      assert.equal(await editorFocused(), true, `${width}px the loop menu leaves focus in the text`)
      await item.click()
    }
    const copiedText = () => page.evaluate(() => navigator.clipboard.readText())
    const expectClean = () => page.locator('.aw-editor-shell').getByText('无问题', { exact: true }).waitFor()

    const waits = '@run=Waits\n@task T {\n  @let delay=2\n  @event E {\n    <sleep(%delay%)>\n    { first }\n    <wait(0.5)>\n    { second }\n  }\n}\n'
    await replace(waits)
    await expectClean()
    assert.equal(await readSource(), waits, `${width}px preserves wait parameters and variable syntax`)
    await replace(waits.replace('<wait(0.5)>', '<wait（0.5）>'))
    await page.locator('.aw-editor-shell').getByText(/个错误/).first().waitFor()
    await replace(source)
    await expectClean()
    // An empty start_url only warns, and clicking after its `=` offers the common start links.
    const starter = '@run=Links\n@task T {\n  @let start_url=\n  @event E {\n    <%start_url%>\n    { hello }\n  }\n}\n'
    await replace(starter)
    await page.locator('.aw-editor-shell').getByText(/1 警告|警告/).first().waitFor()
    const line = page.locator('.cm-line', { hasText: '@let start_url=' })
    const box = await line.boundingBox()
    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
    const popup = page.locator('.cm-tooltip-autocomplete')
    await popup.waitFor()
    for (const link of ['https://chatgpt.com/cloud', 'https://chatgpt.com/images', 'https://claude.ai/new', 'https://claude.ai/code']) {
      await popup.getByText(link, { exact: true }).waitFor()
    }
    await popup.getByText('https://claude.ai/code', { exact: true }).click()
    assert.ok((await readSource()).includes('@let start_url=https://claude.ai/code\n'), `${width}px picks a start link`)
    await replace(source)
    await expectClean()
    // Cursor in an Act's message must insert a valid declaration in the first Task.
    await select(source.indexOf('hello'))
    await page.getByRole('button', { name: '变量', exact: true }).click()
    const withVariable = await readSource()
    assert.ok(withVariable.indexOf('@let name2=') < withVariable.indexOf('@event E {'))
    assert.ok(withVariable.indexOf('@let name2=') > withVariable.indexOf('@let name=existing'))
    assert.equal(await selection(), 'name2', 'new valid variable name is selected for immediate editing')
    await expectClean()
    await page.keyboard.insertText('query')
    assert.ok((await readSource()).includes('@let query='))
    await expectClean()
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    assert.equal(await readSource(), source, 'inserting a Task variable is one undoable transaction')
    await page.getByRole('button', { name: '重做', exact: true }).click()
    assert.ok((await readSource()).includes('@let name2='))

    // The second executor owns its own declaration, with no changes to the first Task.
    await replace(source)
    await select(source.indexOf('world'))
    await page.getByRole('button', { name: '变量', exact: true }).click()
    const secondTaskEdited = await readSource()
    assert.ok(secondTaskEdited.indexOf('@let name=\n') > secondTaskEdited.indexOf('@task Second {'))
    assert.ok(secondTaskEdited.indexOf('@let name=\n') < secondTaskEdited.indexOf('@event Prompt {'))
    await expectClean()

    await replace(source)
    for (const [header, expected] of [
      ['@task First {', task], ['@task Second {', secondTask], ['@event E {', event],
      ['@act {', act], ['@for i in range(1, 3) {', loop], ['{\n        hello', message],
    ]) {
      const openAt = source.indexOf(header) + header.indexOf('{')
      await select(openAt, openAt + 1)
      await copyButton().click()
      assert.equal(await copiedText(), expected, `${width}px copies ${header} including repeat suffix`)
      assert.equal(await readSource(), source, 'copy leaves source intact')
      // Delete at the same delimiter, then undo; copy and deletion have identical boundaries.
      await deleteButton().click()
      const start = source.indexOf(expected)
      assert.equal(await readSource(), source.slice(0, start) + source.slice(start + expected.length))
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      assert.equal(await readSource(), source)
    }

    const eventClose = source.indexOf(event) + event.lastIndexOf('}')
    await select(eventClose)
    await copyButton().click()
    assert.equal(await copiedText(), event, 'closing delimiter also copies the whole block')
    await select(source.indexOf('hello'))
    await copyButton().click()
    assert.equal(await copiedText(), '        hello\n', 'ordinary cursor copies the current line')
    await select(0, source.indexOf('@task First'))
    await copyButton().click()
    assert.equal(await copiedText(), '@run=Editor regression\n', 'selection ending at a line start excludes the next line')
    await select(0, source.length)
    await copyButton().click()
    assert.equal(await copiedText(), source, 'select-all still copies the complete workflow')
    // A selection is copied exactly, and what was copied is tinted briefly.
    await select(source.indexOf('next %i%'), source.indexOf('next %i%') + 4)
    await copyButton().click()
    assert.equal(await copiedText(), 'next', 'a plain selection copies exactly what is selected')
    await page.locator('.cm-flash').first().waitFor()
    assert.equal(await editorFocused(), true, `${width}px toolbar buttons never take focus from the text`)

    // The selection stays visible on the current line: the current line is translucent.
    const colours = await page.evaluate(() => {
      const alpha = (colour) => {
        const match = colour.match(/rgba?\(([^)]+)\)/u)
        if (!match) return 1
        const parts = match[1].split(/[\s,/]+/u).filter(Boolean)
        return parts.length > 3 ? Number(parts[3].replace('%', '')) / (parts[3].includes('%') ? 100 : 1) : 1
      }
      const active = document.querySelector('.cm-activeLine')
      const selection = document.querySelector('.cm-selectionBackground')
      return {
        activeAlpha: active ? alpha(getComputedStyle(active).backgroundColor) : 0,
        selection: selection ? getComputedStyle(selection).backgroundColor : '',
      }
    })
    assert.ok(colours.activeAlpha < 0.5, `${width}px current line must not hide the selection (${colours.activeAlpha})`)
    assert.ok(colours.selection && colours.selection !== 'rgba(0, 0, 0, 0)', 'the selection is painted')

    // 选择块 widens from the message to its loop, then the Event.
    const selectBlock = () => page.getByRole('button', { name: '选择块', exact: true }).click()
    await select(source.indexOf('next %i%'))
    await selectBlock()
    assert.equal(await selection(), '      { next %i% }\n')
    await selectBlock()
    assert.equal(await selection(), loop, 'a second press selects the enclosing loop')
    await selectBlock()
    assert.equal(await selection(), event, 'a third press selects the Event')

    // Copying never scrolls the page or the editor.
    await select(source.indexOf('world'))
    const before = await page.evaluate(() => [scrollY, document.querySelector('.cm-scroller').scrollTop])
    await copyButton().click()
    assert.deepEqual(await page.evaluate(() => [scrollY, document.querySelector('.cm-scroller').scrollTop]), before, `${width}px copy leaves scroll positions alone`)
    // Menus are not modal: opening one must not lock page scroll (which shifts the layout).
    const bodyStyle = () => page.evaluate(() => [document.body.getAttribute('style') ?? '', document.body.hasAttribute('data-scroll-locked')])
    const unlocked = await bodyStyle()
    await page.getByRole('button', { name: '更多', exact: true }).click()
    await page.getByRole('menuitem', { name: /查找替换/ }).waitFor()
    assert.deepEqual(await bodyStyle(), unlocked, 'menus do not lock page scroll')
    await page.keyboard.press('Escape')

    // The loop button names nested loops i, j, k, validates cleanly and refuses a fourth level.
    await replace('@run=Loops\n@task T {\n  @event E {\n    \n  }\n}\n')
    const loopSource = await readSource()
    await select(loopSource.indexOf('    \n') + 4)
    await insertLoop()
    assert.equal(await selection(), 'i', `${width}px first loop is i`)
    await select((await readSource()).indexOf('@for i in range(1, 3) {') + '@for i in range(1, 3) {'.length)
    await insertLoop()
    assert.equal(await selection(), 'j', 'a loop inside i is j')
    await select((await readSource()).indexOf('@for j in range(1, 3) {') + '@for j in range(1, 3) {'.length)
    await insertLoop()
    assert.equal(await selection(), 'k', 'a loop inside i and j is k')
    const threeDeep = await readSource()
    await select(threeDeep.indexOf('@for k in range(1, 3) {') + '@for k in range(1, 3) {'.length)
    await insertLoop()
    await page.getByText('循环最多嵌套 3 层。', { exact: true }).waitFor()
    assert.equal(await readSource(), threeDeep, 'the refused fourth loop changes nothing')
    await select(threeDeep.indexOf('@for k in range(1, 3) {') + '@for k in range(1, 3) {'.length + 1)
    await page.keyboard.press('End')
    await page.keyboard.insertText('\n{ %i%%j%%k% }')
    await expectClean()
    const nestedLoopSource = await readSource()
    const jOpen = nestedLoopSource.indexOf('@for j in range(1, 3) {') + '@for j in range(1, 3) {'.indexOf('{')
    await select(jOpen, jOpen + 1)
    await copyButton().click()
    const copiedLoop = await copiedText()
    assert.ok(copiedLoop.trimStart().startsWith('@for j in range(1, 3) {') && copiedLoop.includes('@for k in') && copiedLoop.trimEnd().endsWith('}'),
      'copying the middle loop takes its nested loop with it')
    await deleteButton().click()
    assert.ok(!(await readSource()).includes('@for j') && (await readSource()).includes('@for i'), 'deleting the middle loop keeps its parent')
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    assert.equal(await readSource(), nestedLoopSource)

    // Chapters with their own sections: one template, valid at once, previewed Act by Act.
    await replace('@run=Book\n@task T {\n  @event 写书 {\n    \n  }\n}\n')
    await select((await readSource()).indexOf('    \n') + 4)
    await insertLoop('章节 × 小节')
    assert.equal(await selection(), '1, 第一章, [小节一, 小节二]', 'the first chapter is selected for editing')
    await expectClean()
    await page.locator('.aw-editor-shell [title="循环展开后的数量"]', { hasText: '1 Event · 3 Act' }).waitFor()
    if (width < 1280) await page.getByRole('button', { name: '结构', exact: true }).click()
    await page.getByRole('tab', { name: '预览' }).click()
    const previewPanel = page.getByRole('tabpanel', { name: '预览' })
    await previewPanel.getByText('写第1章《第一章》第2节：小节二').waitFor()
    await previewPanel.getByText('写第2章《第二章》第1节：小节一').waitFor()
    await previewPanel.getByText('光标所在 Event').waitFor()
    if (width < 1280) await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: '预览' }).waitFor({ state: width < 1280 ? 'detached' : 'visible' })
    if (width >= 1280) await page.getByRole('tab', { name: '大纲' }).click()

    await replace(source)
    await expectClean()

    // A denied clipboard must leave the source untouched and show a clear failure.
    await page.evaluate(() => {
      window.fixtureWriteText = navigator.clipboard.writeText
      window.fixtureExecCommand = document.execCommand
      navigator.clipboard.writeText = async () => { throw new Error('fixture denied') }
      document.execCommand = () => false
    })
    await copyButton().click()
    await page.getByText('复制失败', { exact: true }).waitFor()
    assert.equal(await readSource(), source)
    await page.evaluate(() => {
      navigator.clipboard.writeText = window.fixtureWriteText
      document.execCommand = window.fixtureExecCommand
    })

    await page.getByRole('button', { name: '全屏', exact: true }).click()
    await page.locator('.aw-editor-shell[data-fullscreen=true]').waitFor()
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.aw-editor-shell[data-fullscreen=true]'))
    await expectClean()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false, `${width}px has no horizontal page overflow`)
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/editor-${width}.png`, fullPage: true })
    assert.deepEqual(writes, [], 'editor interactions never publish fixture data')
    assert.deepEqual(errors, [])
    console.log(`PASS ${width}px: English sleep/wait syntax, Task variables, nested loop insertion, selection, exact copy with flash, select block, focus, chapter template and preview, delete, undo/redo, clipboard denial, fullscreen and overflow`)
    await context.close()
  }
} finally { await browser.close() }
