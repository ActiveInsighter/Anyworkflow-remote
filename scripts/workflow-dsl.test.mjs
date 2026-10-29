import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { anyWorkflowCompletion, collectUsableVariables, planStructuredInsert, validateAnyWorkflowSource } = await import('../src/features/editor/lib/anyworkflow-dsl.ts')
const { EditorState } = await import('@codemirror/state')

function errors(source) {
  return validateAnyWorkflowSource(source).filter((diagnostic) => diagnostic.severity === 'error')
}

function assertHasError(source, message) {
  const diagnostics = errors(source)
  assert.ok(diagnostics.length > 0, `expected an error for: ${message}`)
  return diagnostics
}

const conformance = JSON.parse(readFileSync(new URL('./fixtures/dsl-conformance.json', import.meta.url), 'utf8'))
for (const fixture of conformance.cases) {
  assert.equal(errors(fixture.plan).length === 0, fixture.valid, `DSL conformance: ${fixture.name}`)
}

const browserPlan = `@run=Browser
@task Search {
  @event Web {
    search the web
  }
}`
assertHasError(browserPlan, 'unwrapped browser queue text')

const emptyEvent = `@run=Empty
@task Search {
  @event Web {
  }
}`
assertHasError(emptyEvent, 'empty event queue')

const httpUrl = `@run=Http
@task Search {
  @event Web {
    <http://example.com>
  }
}`
assertHasError(httpUrl, 'non-HTTPS URL')

const undefinedVariable = `@run=Variables
@task Search {
  @event Web {
    { search %missing% }
  }
}`
assertHasError(undefinedVariable, 'undefined browser variable')

const oversizedLocalLoop = `@run=Loop
@task Search {
  @event Web {
    @for i in range(1, 201) {
      { search %i% }
    }
  }
}`
assertHasError(oversizedLocalLoop, 'browser local loop limit')

const nestedBrowserMessage = (depth) => {
  let body = '{ hello }'
  for (let index = 1; index < depth; index += 1) body = `{ ${body} }`
  return `@run=Nested
@task Search {
  @event Web {
    ${body}
  }
}`
}
assert.equal(errors(nestedBrowserMessage(3)).length, 0, 'three browser poll levels should pass')
assertHasError(nestedBrowserMessage(4), 'browser poll depth limit')

const afterBlockDirective = `@run=Directive placement
@task Search {
  @event Web {
    { search }
  }
}
@mode=parallel`
assertHasError(afterBlockDirective, 'directive after the first run block')

const validWithoutRunTitle = `@task Search {
  @event Web {
    \`\`\`
    search the web
    \`\`\`
  }
}`
assert.equal(errors(validWithoutRunTitle).length, 0, 'missing @run is valid because the compiler supplies a default title')

const { createStarterPlan } = await import('../src/lib/domain/plan.ts')
const editorStarterPlan = createStarterPlan('新工作流')
assert.equal(errors(editorStarterPlan).length, 0, 'the editor starter syntax is valid for a browser Run')

const eventLocalVariable = `@run=Variables\n@task T {\n  @event E {\n    @var query=browser syntax\n    @act {\n      @event=Search %query%\n      { find %query% }\n    }\n  }\n}`
assert.equal(errors(eventLocalVariable).length, 0, 'Event-local variables are valid in browser queues')
assert.ok(collectUsableVariables(eventLocalVariable, eventLocalVariable.indexOf('{ find')).includes('query'),
  'Event-local variables appear in editor completions')

const { collectWorkflowVariableScope } = await import('../src/lib/workflow-dsl/index.ts')
const loopPlan = `@run=Loop\n@task T {\n  @let file=a\n  @event E {\n    @for i in range(5, 8) {\n      { read %i% of %count% }\n    }\n  }\n}\n@for t in range(1, 2) {\n  @task L {\n    @event E {\n      { x %index% }\n    }\n  }\n}`
assert.equal(errors(loopPlan).length, 0, 'the runtime accepts %index% and %count% inside any @for')
const inQueueLoop = collectWorkflowVariableScope(loopPlan, loopPlan.indexOf('{ read'))
assert.deepEqual(
  inQueueLoop.map((variable) => [variable.name, variable.origin, variable.loop ?? '']),
  [['file', 'declared', ''], ['i', 'loop', ''], ['index', 'loop-alias', 'i'], ['count', 'loop-alias', 'i']],
  'loop aliases are labelled as such, belong to their loop and come after declared names',
)
const completionDoc = loopPlan.replace('{ read %i% of %count% }', '{ read %')
const completionPos = completionDoc.indexOf('{ read %') + '{ read %'.length
const completionState = EditorState.create({ doc: completionDoc })
const completionResult = anyWorkflowCompletion({
  state: completionState,
  pos: completionPos,
  explicit: true,
  matchBefore: (expression) => {
    const line = completionState.doc.lineAt(completionPos)
    const match = new RegExp(expression.source).exec(line.text.slice(0, completionPos - line.from))
    return match ? { from: line.from + match.index, to: completionPos, text: match[0] } : null
  },
})
const completionDetails = Object.fromEntries(completionResult.options.map((option) => [option.label, option.detail]))
assert.deepEqual(completionDetails, {
  '%file%': '变量',
  '%i%': '循环变量',
  '%index%': '循环值，同 %i%',
  '%count%': '循环次数',
}, 'completions say what each loop name is instead of calling everything a plain variable')
assert.ok(completionResult.options.filter((option) => /index|count/u.test(option.label)).every((option) => option.boost < 0),
  'implicit aliases sort after the plan\'s own variables')
const outsideLoop = collectWorkflowVariableScope(loopPlan, loopPlan.indexOf('@event E {'))
assert.deepEqual(outsideLoop.map((variable) => variable.name), ['file'], 'aliases leave scope with their loop')
const shadowed = `@task T {\n  @let index=own\n  @for i in range(2) {\n    @event E { { %index% } }\n  }\n}`
assert.equal(
  collectWorkflowVariableScope(shadowed, shadowed.indexOf('{ %index')).find((variable) => variable.name === 'index')?.origin,
  'loop-alias',
  'inside a loop %index% is the loop\'s, whatever the plan declared',
)
assert.equal(
  collectWorkflowVariableScope(shadowed, shadowed.indexOf('@for')).find((variable) => variable.name === 'index')?.origin,
  'declared',
  'outside a loop the declaration is a plain variable',
)
const nestedAliases = `@task T {\n  @event E {\n    @for i in range(1, 2) {\n      @for j in range(1, 2) {\n        { %i%%j% }\n      }\n    }\n  }\n}`
assert.deepEqual(
  collectWorkflowVariableScope(nestedAliases, nestedAliases.indexOf('{ %i%')).map((variable) => [variable.name, variable.origin, variable.loop ?? '']),
  [['i', 'loop', ''], ['j', 'loop', ''], ['index', 'loop-alias', 'j'], ['count', 'loop-alias', 'j']],
  'every enclosing loop variable is in scope and the aliases follow the innermost loop',
)

const actLocalVariable = `@run=Variables\n@task T {\n  @event E {\n    @act {\n      @var query=browser syntax\n      @event=Search %query%\n      { find %query% }\n    }\n  }\n}`
assert.equal(errors(actLocalVariable).length, 0, 'Act-local variables are valid in browser queues')
assertHasError(actLocalVariable.replace('@var query=browser syntax', '@var bad-name=browser syntax'), 'invalid local variable name')

const forwardLocalVariable = actLocalVariable.replace(
  '@var query=browser syntax\n      @event=Search %query%',
  '@event=Search %query%\n      @var query=browser syntax',
)
assert.equal(errors(forwardLocalVariable).length, 0, 'queue metadata may reference a later local @var')

const localVariableInsert = planStructuredInsert(eventLocalVariable, eventLocalVariable.indexOf('@act'), 'variable')
assert.equal(localVariableInsert.ok, true, 'the variable toolbar targets the current Task even from an Event')
if (localVariableInsert.ok) assert.ok(localVariableInsert.from < eventLocalVariable.indexOf('@event E {'))

const validBrowserAct = `@run=Browser act
@task T {
  @event E {
    @act {
      @event=Search
      { search the web }
    }
  }
}`
assert.equal(errors(validBrowserAct).length, 0, 'an Act may use its original local @event title')

const removedActionDirective = `@run=Old action directive
@task T {
  @event E {
    @act {
      @action=Search
      { search the web }
    }
  }
}`
assertHasError(removedActionDirective, 'removed @action directive')
assert.ok(
  errors(removedActionDirective).some((diagnostic) => diagnostic.message.includes('@action') && diagnostic.message.includes('@event=')),
  'legacy @action must have an actionable diagnostic that points back to @event',
)

const validCaseInsensitiveMode = `@run=Parallel
@mode=PARALLEL
@maxConcurrency=2
@task {
  @event {
    { hello }
  }
}`
assert.equal(errors(validCaseInsensitiveMode).length, 0, 'mode and untitled blocks follow compiler case rules')

const decimalConcurrency = `@run=Bad concurrency
@maxConcurrency=1.0
@task T {
  @event E {
    { hello }
  }
}`
assertHasError(decimalConcurrency, 'non-integer max concurrency')

const eventDirectiveInsideBrowserAct = `@run=Browser act
@task T {
  @event E {
    @act {
      @event=Wrong directive
      { hello }
    }
  }
}`
assert.equal(errors(eventDirectiveInsideBrowserAct).length, 0, 'browser Acts may use local @event titles')

const nestedBrowserAct = `@run=Nested act
@task T {
  @event E {
    @act {
      @event=Outer
      @act {
        { hello }
      }
    }
  }
}`
assertHasError(nestedBrowserAct, 'nested browser Act')

const browserEventInsideLoop = `@run=Loop event
@task T {
  @event E {
    @for i in range(1, 2) {
      @event=Question %i%
      { hello %i% }
    }
  }
}`
assert.equal(errors(browserEventInsideLoop).length, 0, 'browser loop bodies may use local @event titles')

const eventBody = `@task T {
  @event E {

  }
}`
const actInsert = planStructuredInsert(eventBody, eventBody.indexOf('\n\n') + 1, 'act')
assert.equal(actInsert.ok, true, 'Act insertion should work inside an Event')
if (actInsert.ok) {
  assert.match(actInsert.text, /@event=/u)
  assert.doesNotMatch(actInsert.text, /@action/u)
}

const browserActOverflow = `@run=Browser acts
@task T {
  @event E {
    @repeat=10
${Array.from({ length: 21 }, (_, index) => `    @act {\n      { act ${index} }\n    }`).join('\n')}
  }
}`
assertHasError(browserActOverflow, 'browser total Act limit')

const queueLoops = (queue) => `@run=Nested\n@task T {\n  @event E {\n${queue}\n  }\n}`
const nestedLoopPlan = (names) => {
  let body = '{ hello %' + names.at(-1) + '% }'
  for (let index = names.length - 1; index >= 0; index -= 1) body = `@for ${names[index]} in range(1, 2) {\n${body}\n}`
  return queueLoops(body)
}
assert.equal(errors(nestedLoopPlan(['i'])).length, 0, 'one loop level')
assert.equal(errors(nestedLoopPlan(['i', 'j'])).length, 0, 'two loop levels')
assert.equal(errors(nestedLoopPlan(['i', 'j', 'k'])).length, 0, 'three loop levels pass')
assert.ok(
  errors(nestedLoopPlan(['i', 'j', 'k', 'l'])).some((item) => item.message.includes('最多嵌套 3 层')),
  'a fourth loop level is rejected with its limit',
)
assert.equal(
  errors(queueLoops('@for i in range(1, 2) {\n@for j in range(1, 2) {\n@for k in range(1, 2) {\n{ %i%%j%%k% %index% %count% }\n}\n}\n}')).length,
  0,
  'every enclosing loop variable and the aliases are in scope in the innermost body',
)
assertHasError(
  queueLoops('@for i in range(1, 2) {\n@for j in range(1, 2) {\n{ %k% }\n}\n}'),
  'a variable of a loop that does not enclose the body',
)
assertHasError(queueLoops('@for i in range(1, 2) {\n@for i in range(1, 2) {\n{ %i% }\n}\n}'), 'inner loop reusing an enclosing name')
assertHasError(queueLoops('@for i in range(1, 2) {\n@act {\n{ x }\n}\n}'), 'Act inside a loop')
assertHasError(queueLoops('@act {\n@for i in range(1, 2) {\n{ x }\n}\n}'), 'loop inside an Act')
assertHasError(queueLoops('@for i in range(1, 2) {\n{ intro }\n@for j in range(1, 2) {\n{ %j% }\n}\n}'), 'messages beside a nested loop')
assertHasError(queueLoops('@for i in range(1, 2) {\n@repeat=2\n@for j in range(1, 2) {\n{ %j% }\n}\n}'), '@repeat beside a nested loop')
assert.equal(errors(queueLoops('@for i in range(1, 2) {\n@let book=Vol\n@event=%book% %i%\n@for j in range(1, 2) {\n@repeat=2\n{ %book% %j% }\n}\n}')).length, 0,
  'directives before a nested loop and @repeat in the innermost body are fine')
assertHasError(queueLoops('{\n<https://chatgpt.com/>\n@for i in range(1, 2) {\n{ x }\n}\n}'), 'loop header inside a polling group')
const nestedLoopBudget = (a, b, c, repeat = '') =>
  queueLoops(`@for i in range(1, ${a}) {\n@for j in range(1, ${b}) {\n@for k in range(1, ${c}) {\n${repeat}{ %i%%j%%k% }\n}\n}\n}`)
assert.equal(errors(nestedLoopBudget(5, 5, 8)).length, 0, '5 x 5 x 8 is exactly the 200 act limit')
assertHasError(nestedLoopBudget(5, 5, 9), 'nested product over 200 acts')
assertHasError(nestedLoopBudget(200, 200, 200), 'huge nested product is rejected without walking it')
assertHasError(nestedLoopBudget(5, 5, 4, '@repeat=3\n'), '@repeat multiplies the nested product')
assert.equal(errors(nestedLoopBudget(5, 5, 4, '@repeat=2\n')).length, 0, '5 x 5 x 4 x 2 stays within 200')
assert.equal(errors(`@run=Aliases\n@task T {\n  @event E {\n    @for a in range(1, 2) {\n      @for b in range(1, 2) {\n        { %a%%b% %index% %count% }\n      }\n    }\n  }\n}`).length, 0)
assert.equal(
  errors('@for c in range(1, 2) {\n@task T {\n@event E {\n@for i in range(1, 2) {\n{ %c% %i% %index% %count% }\n}\n}\n}\n}').length,
  0,
  'a queue loop inside a Run loop keeps its own aliases',
)
assertHasError(
  '@for i in range(1, 2) {\n@task T {\n@event E {\n@for i in range(1, 2) {\n{ %i% }\n}\n}\n}\n}',
  'queue loop reusing a Run loop variable',
)
assertHasError('@task T {\n@let i=5\n@event E {\n@for i in range(1, 2) {\n{ %i% }\n}\n}\n}', 'queue loop reusing a Task variable')
assert.equal(errors('@task T {\n@event E {\n@for a in range(1, 2) {\n{ x }\n}\n@for a in range(1, 2) {\n{ y }\n}\n}\n}').length, 0, 'sibling loops may share a name')
assertHasError('@for a in range(1, 2) {\n@for b in range(1, 2) {\n@for c in range(1, 2) {\n@for d in range(1, 2) {\n@task T%a%%b%%c%%d% {\n@event E {\n{ x }\n}\n}\n}\n}\n}\n}', 'four Run level loops')
assert.equal(errors('@for a in range(1, 2) {\n@for b in range(1, 2) {\n@for c in range(1, 2) {\n@task T%a%%b%%c% {\n@event E {\n{ x }\n}\n}\n}\n}\n}').length, 0, 'three Run level loops')
assertHasError('@task T {\n@for a in range(1, 2) {\n@for b in range(1, 2) {\n@for c in range(1, 2) {\n@for d in range(1, 2) {\n@event E%a%%b%%c%%d% {\n{ x }\n}\n}\n}\n}\n}\n}', 'four Task level loops')

console.log('workflow DSL assertions passed')

const warnings = (source) => validateAnyWorkflowSource(source).filter((diagnostic) => diagnostic.severity === 'warning')
assert.match(editorStarterPlan, /@let start_url=\n/u, 'the starter plan declares start_url')
assert.match(editorStarterPlan, /<%start_url%>/u, 'the starter plan navigates to start_url')
assert.equal(warnings(editorStarterPlan).length, 1, 'an empty start_url only warns')
assert.match(warnings(editorStarterPlan)[0].message, /默认链接/u)
const withStartUrl = (value, keyword = 'let') => editorStarterPlan.replace('@let start_url=', `@${keyword} start_url=${value}`)
assert.equal(validateAnyWorkflowSource(withStartUrl('https://claude.ai/code')).length, 0, 'a filled start_url is clean')
assert.equal(validateAnyWorkflowSource(withStartUrl('https://claude.ai/new', 'var')).length, 0, '@var stays accepted')
assertHasError(withStartUrl('http://chatgpt.com/'), 'non-https start_url')
assertHasError(withStartUrl('not a link'), 'start_url that is not a link')
assert.equal(errors(editorStarterPlan.replace('@let start_url=', '@let start_url = ')).length, 0, 'spaced empty start_url still resolves')
const customDefault = validateAnyWorkflowSource(editorStarterPlan, { defaultStartUrl: 'https://claude.ai/new' })
assert.match(customDefault.find((item) => item.severity === 'warning').message, /claude\.ai\/new/u, 'the configured default is reported')
console.log('start_url assertions passed')

const waitPlan = body => `@task T {\n@let delay=2\n@event E {\n${body}\n}\n}`
for (const body of ['<sleep(100)>', '<wait(0.25)>\n{hello}', '<sleep(%delay%)>', '{ <sleep(1)> {hello} }*2', '@for i in range(1, 2) {\n<sleep(%i%)>\n{hello}\n}']) {
  assert.deepEqual(errors(waitPlan(body)), [], `valid wait: ${body}`)
}
for (const body of ['<sleep（100）>', '<sleep（100)>', '<wait(100）>', '<sleep(1', '{ <sleep(1) {hello} }', '<sleep(-1)>', '<sleep()>', '<wait(86401)>', '<sleep(1e3)>', '<wait(Infinity)>', '<wait(%missing%)>', '{ <sleep(-1)> {hello} }']) {
  assertHasError(waitPlan(body), `invalid wait: ${body}`)
}

const { parseEventActs } = await import('../src/lib/domain/event-structure.ts')
assert.equal(parseEventActs('<sleep(1)>\n{ <wait(2)> {hello} }*2')[0].messageCount, 5, 'waits count toward queue progress, preserving executor node indexes')
