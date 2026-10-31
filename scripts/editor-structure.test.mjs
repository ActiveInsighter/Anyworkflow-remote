import assert from 'node:assert/strict'

const { EditorState } = await import('@codemirror/state')
const { anyWorkflowCompletion, startLinkOptions } = await import('../src/features/editor/lib/dsl-completion.ts')
const { readOutline, outlinePathAt, countOutline } = await import('../src/features/editor/lib/outline.ts')
const { planSetStartUrl, taskStartUrlAt } = await import('../src/features/editor/lib/start-url.ts')
const { planSmartDuplicate, planQueueLineInsert } = await import('../src/features/editor/lib/editor-commands.ts')
const { validateWorkflowSource } = await import('../src/lib/workflow-dsl/index.ts')
const { parseEditorPreferences, DEFAULT_EDITOR_PREFERENCES } = await import('../src/features/editor/lib/editor-preferences.ts')

const apply = (source, plan) => source.slice(0, plan.from) + (plan.insert ?? plan.text) + source.slice(plan.to ?? plan.from)
const errors = (source) => validateWorkflowSource(source).filter((item) => item.severity === 'error')

const plan = `@run=Outline
@task First {
  @mode=serial
  @let start_url=https://claude.ai/new

  @event E {
    @act {
      @event=greet
      { hello }*2
    }
    @for i in range(1, 3) {
      { next %i% }
    }
  }
}
@task Second {
  @mode=serial
  @event P {
    { world }
    \`\`\`
    @task Fake {
    \`\`\`
  }
}
`
assert.equal(errors(plan).length, 0, 'fixture plan is valid')

// Outline: Tasks, Events, Acts and loops; messages are counted, fenced text never adds nodes.
const outline = readOutline(plan)
assert.deepEqual(outline.map((node) => [node.kind, node.title, node.detail]), [
  ['task', 'First', 'claude.ai/new'],
  ['task', 'Second', ''],
])
assert.deepEqual(outline[0].children[0].children.map((node) => [node.kind, node.title, node.detail, node.repeat, node.messages]), [
  ['act', 'Act', 'greet', null, 1],
  ['for', 'i in range(1, 3)', '', null, 1],
])
assert.deepEqual(countOutline(outline), { task: 2, event: 2, act: 1, for: 1, messages: 3 })
const listOutline = readOutline('@task T {\n  @event E {\n    @for ch, t in [\n      (1, 甲)\n      (2, 乙)\n    ] {\n      { %t% }\n    }\n  }\n}')
assert.deepEqual(listOutline[0].children[0].children.map((node) => [node.kind, node.title, node.messages]), [['for', 'ch, t in [2 项]', 1]],
  'a list loop spanning lines is one outline node named by its size')
assert.deepEqual(outlinePathAt(outline, plan.indexOf('next %i%')).map((node) => node.kind), ['task', 'event', 'for'])
assert.deepEqual(outlinePathAt(outline, 0), [], 'the @run line belongs to no Task')
assert.equal(readOutline('@task Open {\n  @event E {\n').length, 1, 'unclosed blocks still appear while typing')

// start_url: rewrite the Task's own declaration, or add one after its directives.
assert.equal(taskStartUrlAt(plan, plan.indexOf('hello')).declaration.value, 'https://claude.ai/new')
assert.equal(taskStartUrlAt(plan, plan.indexOf('world')).declaration, null)
assert.equal(taskStartUrlAt(plan, 0), null)
const rewritten = apply(plan, planSetStartUrl(plan, plan.indexOf('hello'), 'https://chatgpt.com/images'))
assert.ok(rewritten.includes('  @let start_url=https://chatgpt.com/images\n\n  @event E {'))
assert.equal(errors(rewritten).length, 0)
const added = apply(plan, planSetStartUrl(plan, plan.indexOf('world'), 'https://claude.ai/code'))
assert.ok(added.includes('@task Second {\n  @mode=serial\n  @let start_url=https://claude.ai/code\n  @event P {'))
assert.equal(errors(added).length, 0)
assert.equal(planSetStartUrl(plan, 0, 'https://claude.ai/code').ok, false, 'outside a Task nothing changes')
assert.equal(planSetStartUrl(plan, plan.indexOf('hello'), 'https://claude.ai/new').ok, false, 'same value is a no-op')
const nestedOnly = '@task T {\n  @event E {\n    @let start_url=https://x.example/\n    { hi }\n  }\n}\n'
assert.equal(taskStartUrlAt(nestedOnly, nestedOnly.indexOf('hi')).declaration, null, 'nested declarations are not the Task\'s')
const empty = '@task T {\n  @let start_url=\n  @event E {\n    { hi }\n  }\n}\n'
assert.ok(apply(empty, planSetStartUrl(empty, empty.indexOf('hi'), 'https://chatgpt.com/')).includes('@let start_url=https://chatgpt.com/\n'))

// Duplicate: a selected brace copies the whole block below it; otherwise the current line.
const eventBrace = plan.indexOf('{', plan.indexOf('@event P'))
const duplicated = planSmartDuplicate(plan, eventBrace, eventBrace)
assert.equal(duplicated.ok, true)
const withCopy = apply(plan, duplicated)
assert.equal((withCopy.match(/@event P \{/gu) ?? []).length, 2)
assert.equal(errors(withCopy).length, 0, 'a duplicated Event keeps the plan valid')
assert.equal(withCopy.slice(duplicated.anchor, duplicated.anchor + 12), '  @event P {')
const lineCopy = apply(plan, planSmartDuplicate(plan, plan.indexOf('{ world }') + 2, plan.indexOf('{ world }') + 2))
assert.equal((lineCopy.match(/\{ world \}/gu) ?? []).length, 2)

// Waits go on their own line in an Event queue, never inside a message.
const waitAt = plan.indexOf('{ world }')
const wait = planQueueLineInsert(plan, waitAt, '<sleep(5)>', '5')
assert.equal(wait.ok, true)
const withWait = apply(plan, wait)
assert.ok(withWait.includes('    <sleep(5)>\n    { world }'))
assert.equal(errors(withWait).length, 0)
assert.equal(withWait.slice(wait.from + wait.cursorOffset, wait.from + wait.cursorOffset + wait.selectionLength), '5')
assert.equal(planQueueLineInsert(plan, plan.indexOf('world'), '<sleep(5)>', '5').ok, false)
assert.equal(planQueueLineInsert(plan, plan.indexOf('@mode'), '<sleep(5)>', '5').ok, false)

// start_url completion offers exactly the links the host configured.
function complete(doc, links) {
  const pos = doc.indexOf('start_url=') + 'start_url='.length
  const state = EditorState.create({ doc, extensions: links ? [startLinkOptions.of(links)] : [] })
  return anyWorkflowCompletion({
    state,
    pos,
    explicit: true,
    matchBefore: () => null,
  })
}
const startDoc = '@task T {\n  @let start_url=\n}\n'
assert.equal(complete(startDoc, null), null, 'no configured links, no list')
const offered = complete(startDoc, [{ label: '工作台', url: 'https://example.com/desk' }])
assert.deepEqual(offered.options.map((option) => [option.label, option.detail]), [['https://example.com/desk', '工作台']])

// Display preferences tolerate missing or corrupt storage.
assert.deepEqual(parseEditorPreferences(null), DEFAULT_EDITOR_PREFERENCES)
assert.deepEqual(parseEditorPreferences('{bad'), DEFAULT_EDITOR_PREFERENCES)
assert.deepEqual(parseEditorPreferences('{"fontSize":"huge","lineWrap":false}'), { ...DEFAULT_EDITOR_PREFERENCES, lineWrap: false })

console.log('editor structure: outline, start_url, duplicate, wait, completion and preferences ok')

{
  const { planLoopInsert } = await import('../src/features/editor/lib/editor-commands.ts')
  const queue = '@task T {\n  @event E {\n    { a }\n  }\n}\n'
  const at = queue.indexOf('{ a }')
  const loop = apply(queue, planLoopInsert(queue, at))
  assert.ok(loop.includes('    @for i in range(1, 3) {\n      \n    }\n    { a }'), 'text after the cursor keeps its indentation')
  console.log('editor structure: inserts before indented text keep it indented')
}
