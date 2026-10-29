import assert from 'node:assert/strict'

const { loopScopeAt, planLoopInsert, planStructuredInsert, planSmartDelete, planSmartCopy, planSmartDuplicate, planQueueLineInsert } =
  await import('../src/features/editor/lib/editor-commands.ts')
const { validateWorkflowSource: validateAnyWorkflowSource } = await import('../src/lib/workflow-dsl/index.ts')

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
const selectedLines = planSmartCopy('first\nsecond\nthird', 1, 7)
assert.equal(selectedLines.text, 'first\nsecond\n')
assert.equal(planSmartCopy('first\nsecond\nthird', 0, 6).text, 'first\n', 'end at next line start excludes it')
assert.equal(planSmartCopy(source, source.length, 0).text, source, 'reversed full selection copies everything')
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
assert.equal(planSmartCopy(fenced, fake, fake + 1).text, '@task Fake {\n', 'fenced braces are plain text')
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
  const plan = planSmartDelete(nestedLoops, nestedLoops.indexOf('@for k') + 15, nestedLoops.indexOf('@for k') + 16)
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

console.log('editor command assertions passed')
