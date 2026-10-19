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
  'declared',
  'a variable the plan declares itself is never reported as a loop alias',
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
