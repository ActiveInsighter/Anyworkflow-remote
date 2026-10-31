import assert from 'node:assert/strict'

const { loopScopeAt, planLoopInsert, planSelectBlock, planStructuredInsert, planSmartDelete, planSmartCopy, planSmartDuplicate, planQueueLineInsert } =
  await import('../src/features/editor/lib/editor-commands.ts')
const { inspectWorkflowSource, validateWorkflowSource: validateAnyWorkflowSource } = await import('../src/lib/workflow-dsl/index.ts')

const source = `@run=Editor
@task First {
  @mode=serial
  @let name=existing

  @event E {
    @act {
      { hello }
    }
    @for i in range(1, 3) {
      { next %i% }
    }
  }
}
@task Second {
  @mode=serial
  @event Prompt {
    { world }
  }
}`

for (const position of ['hello', 'next %i%', '@event E {', '@mode=serial']) {
  const plan = planStructuredInsert(source, source.indexOf(position), 'variable')
  assert.equal(plan.ok, true, `insert Task variable from ${position}`)
  assert.ok(plan.from > source.indexOf('@let name=existing'))
  assert.ok(plan.from < source.indexOf('@event E {'), 'declarations precede all Task children')
  const edited = source.slice(0, plan.from) + plan.text + source.slice(plan.from)
  assert.deepEqual(validateAnyWorkflowSource(edited), [], 'toolbar inserts a valid declaration immediately')
  assert.equal(plan.text.slice(plan.cursorOffset, plan.cursorOffset + plan.selectionLength), 'name2')
}
const secondTaskVariable = planStructuredInsert(source, source.indexOf('world'), 'variable')
assert.equal(secondTaskVariable.ok, true)
assert.ok(secondTaskVariable.from > source.indexOf('@task Second {'))
assert.ok(secondTaskVariable.from < source.indexOf('@event Prompt {'))
assert.equal(planStructuredInsert(source, 0, 'variable').ok, false, 'Run has no current Task')
assert.equal(planStructuredInsert('@task Broken {\n@event E {\n{ hello }', 40, 'variable').ok, false)

// Copy and delete must resolve the same range from either delimiter, with/without a selection.
for (const header of ['@task First {', '@task Second {', '@event E {', '@act {', '@for i in range(1, 3) {', '{ hello }']) {
  const openAt = source.indexOf(header) + header.indexOf('{')
  const initial = planSmartDelete(source, openAt, openAt + 1)
  assert.equal(initial.ok, true)
  const closeAt = source.lastIndexOf('}', initial.to - 1)
  for (const braceAt of [openAt, closeAt]) {
    for (const selectionLength of [0, 1]) {
      const copy = planSmartCopy(source, braceAt, braceAt + selectionLength)
      const deletion = planSmartDelete(source, braceAt, braceAt + selectionLength)
      assert.equal(copy.ok, true)
      assert.equal(copy.from, initial.from)
      assert.equal(copy.to, initial.to)
      assert.equal(copy.text, source.slice(deletion.from, deletion.to))
    }
  }
}
const lineCopy = planSmartCopy(source, source.indexOf('hello'), source.indexOf('hello'))
assert.equal(lineCopy.text, '      { hello }\n', 'plain cursor copies the current line')
const selected = planSmartCopy('first\nsecond\nthird', 1, 7)
assert.equal(selected.text, 'irst\ns', 'a selection is copied exactly as selected')
assert.equal(selected.kind, 'selection')
assert.equal(selected.message, '已复制选中内容 · 2 行')
assert.equal(planSmartCopy('first\nsecond\nthird', 0, 6).text, 'first\n')
const helloLine = source.indexOf('      { hello }')
assert.equal(planSmartCopy(source, helloLine, helloLine + '      { hello'.length).text, '      { hello',
  'a selection holding one brace among other text stays exact')
const braceWithSpaces = source.indexOf('{ hello }') + '{ hello '.length
assert.equal(planSmartCopy(source, braceWithSpaces - 1, braceWithSpaces + 1).kind, 'block', 'a lone brace with spaces still means its block')
assert.equal(planSmartCopy(source, source.length, 0).text, source, 'reversed full selection copies everything')
assert.equal(planSmartCopy(source, source.length, 0).message.startsWith('已复制全部内容'), true)
const eventCopy = planSmartCopy(source, source.indexOf('@event E {') + 9, source.indexOf('@event E {') + 9)
assert.match(eventCopy.message, /^已复制Event「E」 · \d+ 行$/u, 'block copies name the block and its size')
const duplicateSelection = planSmartDuplicate('ab cd', 0, 2)
assert.deepEqual([duplicateSelection.from, duplicateSelection.text], [2, 'ab'], 'a selection duplicates inline')
assert.equal(planSmartCopy('', 0, 0).ok, false)
assert.equal(planSmartCopy('first\nsecond', 0, 0).text, 'first\n', 'offset zero is the first line')

const inline = '@task T {\n  @event E {\n    { one }*2 { two }\n  }\n}'
const inlineOpen = inline.indexOf('{ one')
assert.equal(planSmartCopy(inline, inlineOpen, inlineOpen + 1).text, '    { one }*2', 'do not copy a sibling on the same line')
const inlineDelete = planSmartDelete(inline, inlineOpen, inlineOpen + 1)
assert.ok((inline.slice(0, inlineDelete.from) + inline.slice(inlineDelete.to)).includes('{ two }'))
const secondOpen = inline.indexOf('{ two')
assert.equal(planSmartCopy(inline, secondOpen, secondOpen + 1).text, '{ two }\n', 'copy the second inline sibling independently')

const nestedPoll = '@task T {\n  @event E {\n    {\n      {\n        { hello }\n      }*2\n    }\n  }\n}'
const nestedOpen = nestedPoll.indexOf('      {') + 6
assert.equal(planSmartCopy(nestedPoll, nestedOpen, nestedOpen + 1).text, '      {\n        { hello }\n      }*2\n', 'nested poll remains a selectable block')

const fenced = '@task T {\n  @event E {\n    ~~~\n@task Fake {\n}\n    ~~~\n    { real }\n  }\n}'
const fake = fenced.indexOf('@task Fake') + '@task Fake '.length
assert.equal(planSmartCopy(fenced, fake, fake + 1).text, '{', 'fenced braces are plain text')
assert.equal(planSmartCopy(fenced, fake, fake).text, '@task Fake {\n', 'a cursor on a fenced brace copies its line')
const taskOpen = fenced.indexOf('{')
assert.equal(planSmartCopy(fenced, taskOpen, taskOpen + 1).text, fenced, 'fenced braces do not close the enclosing Task')
const fakeVariable = planStructuredInsert(fenced, fake, 'variable')
assert.equal(fakeVariable.ok, true)
assert.ok(fakeVariable.from < fenced.indexOf('@event E {'), 'Task lookup ignores fenced fake headers')

const prompt = '@task T {\n  @event E {\n    {\n@task Example {\n}\n    }\n  }\n}'
const promptVariable = planStructuredInsert(prompt, prompt.indexOf('Example'), 'variable')
assert.equal(promptVariable.ok, true)
assert.ok(promptVariable.from < prompt.indexOf('@event E {'), 'prompt text cannot create a new Task scope')

const loopTask = '@for chapter in range(1, 2) {\n  @task T {\n    @event E {\n      { hello }\n    }\n  }\n}'
const loopVariable = planStructuredInsert(loopTask, loopTask.indexOf('hello'), 'variable')
assert.equal(loopVariable.ok, true)
assert.ok(loopVariable.from > loopTask.indexOf('@task T {'))
assert.ok(loopVariable.from < loopTask.indexOf('@event E {'))
assert.deepEqual(validateAnyWorkflowSource(loopTask.slice(0, loopVariable.from) + loopVariable.text + loopTask.slice(loopVariable.from)), [])

const sharedClosers = '@task T {\n  @event E {\n    { hello }\n  }}\n'
assert.deepEqual(validateAnyWorkflowSource(sharedClosers), [])
const siblingEvent = planStructuredInsert(sharedClosers, sharedClosers.indexOf('hello'), 'event')
assert.equal(siblingEvent.ok, true)
const filledEvent = siblingEvent.text.replace('@event  {', '@event Second {').replace('      \n', '      next\n')
assert.deepEqual(validateAnyWorkflowSource(sharedClosers.slice(0, siblingEvent.from) + filledEvent + sharedClosers.slice(siblingEvent.from)), [],
  'adding a sibling Event handles Task/Event closing braces on the same line')

// Nested loops are ordinary blocks for copy and delete, from either delimiter.
const nestedLoops = '@task T {\n  @event E {\n    @for i in range(1, 2) {\n      @for j in range(1, 2) {\n        @for k in range(1, 2) {\n          { %i%%j%%k% }\n        }\n      }\n    }\n    { after }\n  }\n}'
assert.deepEqual(validateAnyWorkflowSource(nestedLoops), [])
for (const header of ['@for i in range(1, 2) {', '@for j in range(1, 2) {', '@for k in range(1, 2) {']) {
  const from = nestedLoops.lastIndexOf('\n', nestedLoops.indexOf(header)) + 1
  const closeAt = (() => {
    let depth = 0
    for (let index = nestedLoops.indexOf(header) + header.length - 1; index < nestedLoops.length; index += 1) {
      if (nestedLoops[index] === '{') depth += 1
      if (nestedLoops[index] === '}' && --depth === 0) return index
    }
    return -1
  })()
  const expected = nestedLoops.slice(from, nestedLoops.indexOf('\n', closeAt) + 1)
  const openAt = nestedLoops.indexOf(header) + header.indexOf('{')
  for (const braceAt of [openAt, closeAt]) {
    assert.equal(planSmartCopy(nestedLoops, braceAt, braceAt + 1).text, expected, `copy ${header} from either brace`)
    const deletion = planSmartDelete(nestedLoops, braceAt, braceAt)
    assert.equal(nestedLoops.slice(deletion.from, deletion.to), expected, `delete ${header} from either brace`)
  }
}
const withoutInnerLoop = (() => {
  const brace = nestedLoops.indexOf('@for k') + '@for k in range(1, 2) '.length
  const plan = planSmartDelete(nestedLoops, brace, brace + 1)
  return nestedLoops.slice(0, plan.from) + nestedLoops.slice(plan.to)
})()
assert.ok(!withoutInnerLoop.includes('@for k'), 'deleting the innermost loop leaves its parents')
assert.ok(withoutInnerLoop.includes('@for j') && withoutInnerLoop.includes('{ after }'))

// The toolbar names nested loops i, j, k by what is already in scope and stops at three levels.
const loopQueue = (inner) => `@task T {\n  @event E {\n${inner}\n  }\n}`
const emptyEvent = loopQueue('    ')
const firstLoop = planLoopInsert(emptyEvent, emptyEvent.indexOf('    \n') + 4)
assert.equal(firstLoop.ok, true)
assert.equal(firstLoop.text.slice(firstLoop.cursorOffset, firstLoop.cursorOffset + firstLoop.selectionLength), 'i', 'first loop is i')
assert.equal(firstLoop.text, '@for i in range(1, 3) {\n      \n    }\n', 'the cursor sits after the line indent, so later lines follow it')
assert.deepEqual(validateAnyWorkflowSource(emptyEvent.slice(0, firstLoop.from) + firstLoop.text.replace('      \n', '      { hello }\n') + emptyEvent.slice(firstLoop.from)), [])

const insertIntoBody = (source, marker) => {
  const at = source.indexOf(marker) + marker.length
  const plan = planLoopInsert(source, at)
  assert.equal(plan.ok, true, `insert after ${marker}`)
  const name = plan.text.slice(plan.cursorOffset, plan.cursorOffset + plan.selectionLength)
  return { plan, name, edited: source.slice(0, plan.from) + plan.text + source.slice(plan.from) }
}
const second = insertIntoBody(firstLoop.text.length && (emptyEvent.slice(0, firstLoop.from) + firstLoop.text + emptyEvent.slice(firstLoop.from)), '@for i in range(1, 3) {')
assert.equal(second.name, 'j', 'a loop inside i is j')
assert.match(second.plan.text, /^ {6}@for j in range\(1, 3\) \{\n {8}\n {6}\}\n$/u, 'a cursor at the end of a block opener nests inside it, one level deeper')
const third = insertIntoBody(second.edited, '@for j in range(1, 3) {')
assert.equal(third.name, 'k', 'a loop inside i and j is k')
const fourth = planLoopInsert(third.edited, third.edited.indexOf('@for k in range(1, 3) {') + '@for k in range(1, 3) {'.length)
assert.equal(fourth.ok, false, 'a fourth level is refused')
assert.match(fourth.message, /最多嵌套 3 层/u)
assert.equal(planLoopInsert(third.edited, third.edited.indexOf('  @event E {') + 1).ok, true, 'a sibling above the nest is fine')
const siblingAfter = planLoopInsert(third.edited, third.edited.indexOf('\n  }\n}') )
assert.equal(siblingAfter.ok, true)
assert.equal(siblingAfter.text.slice(siblingAfter.cursorOffset, siblingAfter.cursorOffset + 1), 'i', 'closed loops free their names again')

const taskLevel = '@task T {\n  @let i=1\n  \n}'
const taskLoop = planLoopInsert(taskLevel, taskLevel.indexOf('  \n}') + 2)
assert.equal(taskLoop.text.slice(taskLoop.cursorOffset, taskLoop.cursorOffset + taskLoop.selectionLength), 'j', 'a declared variable keeps its name')
const runLoop = loopScopeAt('@for i in range(1, 2) {\n  @task T {\n    @event E {\n      \n    }\n  }\n}', 52)
assert.equal(runLoop.ok && runLoop.name, 'j', 'a queue loop under a Run loop skips the Run loop name')
assert.equal(runLoop.ok && runLoop.depth, 0, 'nesting is counted per level')
assert.equal(loopScopeAt('@task T {\n  @event E {\n    {\n      \n    }\n  }\n}', 33).ok, false, 'no loops inside a message block')
assert.equal(loopScopeAt('@task T {\n  @event E {\n    @act {\n      \n    }\n  }\n}', 38).ok, false, 'no loops inside an Act')
const midLine = loopQueue('    { hello }')
const midPlan = planLoopInsert(midLine, midLine.indexOf('hello'))
assert.equal(midPlan.ok, false, 'inside a message the cursor is refused')
const afterEventHeader = '@task T {\n  @event E {\n  }\n}'
const headerPlan = planLoopInsert(afterEventHeader, afterEventHeader.indexOf('E {') + 3)
assert.equal(headerPlan.ok, true)
assert.equal(headerPlan.from, afterEventHeader.indexOf('\n  }') + 1, 'a mid-line cursor inserts on the next line')
assert.ok(headerPlan.text.startsWith('    @for i'), 'after an opener line the loop lands inside it, one indent deeper')
const noTrailingNewline = planLoopInsert('@task T {\n  @event E {', '@task T {\n  @event E {'.length)
assert.equal(noTrailingNewline.ok, true)
assert.ok(noTrailingNewline.text.startsWith('\n'), 'a missing final newline is added first')

// Select block widens one level at a time: message -> loop -> Event -> Task.
const widen = (from, to) => planSelectBlock(source, from, to)
const nextAt = source.indexOf('next %i%')
const message = widen(nextAt, nextAt)
assert.equal(source.slice(message.from, message.to), '      { next %i% }\n')
const loop = widen(message.from, message.to)
assert.equal(loop.label, '循环')
assert.ok(source.slice(loop.from, loop.to).startsWith('    @for i in range(1, 3) {'))
const event = widen(loop.from, loop.to)
assert.equal(event.label, 'Event「E」')
const task = widen(event.from, event.to)
assert.equal(task.label, 'Task「First」')
assert.equal(widen(0, source.length).ok, false, 'nothing is wider than the whole source')
assert.equal(widen(0, 0).ok, false, 'the Run header line is in no block')

// Loop templates land valid in every context and select the part to edit first.
const contexts = {
  event: ['@task T {\n  @event E {\n    \n  }\n}', '@event E {\n    '],
  task: ['@task T {\n  \n}', '@task T {\n  '],
  run: ['@run=R\n', '@run=R\n'],
}
const expectedActs = { range: { event: 3 }, list: { event: 3 }, outline: { event: 3, task: 3, run: 3 } }
for (const [context, [base, marker]] of Object.entries(contexts)) {
  for (const template of ['range', 'list', 'outline']) {
    const at = base.indexOf(marker) + marker.length
    const plan = planLoopInsert(base, at, template)
    assert.equal(plan.ok, true, `${template} in ${context}`)
    const edited = base.slice(0, plan.from) + plan.text + base.slice(plan.from)
    const picked = plan.text.slice(plan.cursorOffset, plan.cursorOffset + plan.selectionLength)
    assert.equal(picked, { range: 'i', list: '甲, 乙, 丙', outline: '1, 第一章, [小节一, 小节二]' }[template])
    const acts = expectedActs[template][context]
    if (!acts) continue
    const filled = edited.replace(/\{\n(\s*)\n(\s*)\}/u, `{\n$1{ %${template === 'list' ? 'item' : 'i'}% }\n$2}`)
    const inspection = inspectWorkflowSource(filled)
    assert.deepEqual(inspection.diagnostics, [], `${template} in ${context} validates`)
    assert.equal(inspection.events.reduce((sum, item) => sum + item.actCount, 0), acts, `${template} in ${context} expands`)
  }
}
const outline = planLoopInsert(contexts.event[0], contexts.event[0].indexOf('    \n') + 4, 'outline')
const outlined = contexts.event[0].slice(0, outline.from) + outline.text + contexts.event[0].slice(outline.from)
const [preview] = inspectWorkflowSource(outlined).events
assert.match(JSON.stringify(preview.acts), /写第1章《第一章》第2节：小节二/u, 'chapters bind their own sections')
assert.match(JSON.stringify(preview.acts), /写第2章《第二章》第1节：小节一/u)
const deepQueue = '@task T {\n  @event E {\n    @for a in range(1, 2) {\n      @for b in range(1, 2) {\n        \n      }\n    }\n  }\n}'
const tooDeep = planLoopInsert(deepQueue, deepQueue.indexOf('        \n') + 8, 'outline')
assert.equal(tooDeep.ok, false, 'an outline needs two free loop levels inside a queue')
assert.match(tooDeep.message, /两层循环/u)

// A list header spanning lines is one loop block that starts on its `@for` line.
const listLoop = '@task T {\n  @event E {\n    @for ch, t in [\n      (1, 甲)\n      (2, 乙)\n    ] {\n      { %t% }\n    }\n  }\n}'
assert.deepEqual(validateAnyWorkflowSource(listLoop), [])
const listOpen = listLoop.indexOf('] {') + 2
const listCopy = planSmartCopy(listLoop, listOpen, listOpen)
assert.equal(listCopy.text, listLoop.slice(listLoop.indexOf('    @for'), listLoop.indexOf('  }\n}')), 'the copy spans header lines and body')
const insideList = planSelectBlock(listLoop, listLoop.indexOf('(2, 乙)'), listLoop.indexOf('(2, 乙)'))
assert.equal(insideList.label, '循环')
assert.equal(loopScopeAt(listLoop, listLoop.indexOf('{ %t% }')).name, 'i')

console.log('editor command assertions passed')
