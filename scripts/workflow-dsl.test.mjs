import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { collectUsableVariables, planStructuredInsert, validateAnyWorkflowSource } = await import('../src/components/editor/anyworkflow-dsl.ts')

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

const editorStarterPlan = `@run=新工作流
@mode=serial

@task Task {
  @mode=serial

  @event Event {
    {
      在这里写第一条消息
    }
  }
}`
assert.equal(errors(editorStarterPlan).length, 0, 'the editor starter syntax is valid for a browser Run')

const eventLocalVariable = `@run=Variables\n@task T {\n  @event E {\n    @var query=browser syntax\n    @act {\n      @event=Search %query%\n      { find %query% }\n    }\n  }\n}`
assert.equal(errors(eventLocalVariable).length, 0, 'Event-local variables are valid in browser queues')
assert.ok(collectUsableVariables(eventLocalVariable, eventLocalVariable.indexOf('{ find')).includes('query'),
  'Event-local variables appear in editor completions')

const actLocalVariable = `@run=Variables\n@task T {\n  @event E {\n    @act {\n      @var query=browser syntax\n      @event=Search %query%\n      { find %query% }\n    }\n  }\n}`
assert.equal(errors(actLocalVariable).length, 0, 'Act-local variables are valid in browser queues')
assertHasError(actLocalVariable.replace('@var query=browser syntax', '@var bad-name=browser syntax'), 'invalid local variable name')

const forwardLocalVariable = actLocalVariable.replace(
  '@var query=browser syntax\n      @event=Search %query%',
  '@event=Search %query%\n      @var query=browser syntax',
)
assert.equal(errors(forwardLocalVariable).length, 0, 'queue metadata may reference a later local @var')

const localVariableInsert = planStructuredInsert(eventLocalVariable, eventLocalVariable.indexOf('@act'), 'variable')
assert.equal(localVariableInsert.ok, true, 'the variable toolbar inserts into an Event at the cursor')
if (localVariableInsert.ok) assert.ok(localVariableInsert.from > eventLocalVariable.indexOf('@event E {'))

const validCodexPlan = `@run=Codex
@Codex Research {
  @event Prompt {
    @act {
      @event=Search
      { search the web }
    }
  }
}`
assert.equal(errors(validCodexPlan).length, 0, 'valid Codex plan should pass')

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

const decimalCodexLoop = `@run=Codex loop
@Codex T {
  @event E {
    @for i in range(1.0, 2) {
      { hello %i% }
    }
  }
}`
assertHasError(decimalCodexLoop, 'Codex decimal range syntax')

const emptyCodexLoop = `@run=Empty Codex loop
@Codex T {
  @event E {
    @for i in range(3, 1) {
      { never runs }
    }
  }
}`
assertHasError(emptyCodexLoop, 'empty Codex range')

const codexMessageOverflow = `@run=Codex messages
@Codex T {
  @event E {
    @act {
      @for i in range(1, 1000) {
        { first %i% }
        { second %i% }
      }
    }
  }
}`
assertHasError(codexMessageOverflow, 'Codex messages per Act limit')

const browserActOverflow = `@run=Browser acts
@task T {
  @event E {
    @repeat=10
${Array.from({ length: 21 }, (_, index) => `    @act {\n      { act ${index} }\n    }`).join('\n')}
  }
}`
assertHasError(browserActOverflow, 'browser total Act limit')

const nestedCodexAct = `@run=Nested Codex act
@Codex T {
  @event E {
    @act {
      @act {
        { hello }
      }
    }
  }
}`
assertHasError(nestedCodexAct, 'nested Codex Act')

const invalidCodexPlan = `@run=Codex
@Codex Research {
  @event Prompt {
    plain text is not a Codex prompt
  }
}`
assertHasError(invalidCodexPlan, 'unwrapped Codex prompt')

console.log('workflow DSL assertions passed')
