import assert from 'node:assert/strict'

const { planStructuredInsert, planSmartDelete, planSmartCopy, validateAnyWorkflowSource } =
  await import('../src/components/editor/anyworkflow-dsl.ts')

const source = `@run=Editor
@task First {
  @mode=serial
  @var name=existing

  @event E {
    @act {
      { hello }
    }
    @for i in range(1, 3) {
      { next %i% }
    }
  }
}
@Codex Second {
  @mode=serial
  @event Prompt {
    { world }
  }
}`

for (const position of ['hello', 'next %i%', '@event E {', '@mode=serial']) {
  const plan = planStructuredInsert(source, source.indexOf(position), 'variable')
  assert.equal(plan.ok, true, `insert Task variable from ${position}`)
  assert.ok(plan.from > source.indexOf('@var name=existing'))
  assert.ok(plan.from < source.indexOf('@event E {'), 'declarations precede all Task children')
  const edited = source.slice(0, plan.from) + plan.text + source.slice(plan.from)
  assert.deepEqual(validateAnyWorkflowSource(edited), [], 'toolbar inserts a valid declaration immediately')
  assert.equal(plan.text.slice(plan.cursorOffset, plan.cursorOffset + plan.selectionLength), 'name2')
}
const codexVariable = planStructuredInsert(source, source.indexOf('world'), 'variable')
assert.equal(codexVariable.ok, true)
assert.ok(codexVariable.from > source.indexOf('@Codex Second {'))
assert.ok(codexVariable.from < source.indexOf('@event Prompt {'))
assert.equal(planStructuredInsert(source, 0, 'variable').ok, false, 'Run has no current Task')
assert.equal(planStructuredInsert('@task Broken {\n@event E {\n{ hello }', 40, 'variable').ok, false)

// Copy and delete must resolve the same range from either delimiter, with/without a selection.
for (const header of ['@task First {', '@Codex Second {', '@event E {', '@act {', '@for i in range(1, 3) {', '{ hello }']) {
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

console.log('editor command assertions passed')
