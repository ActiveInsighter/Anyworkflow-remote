import assert from 'node:assert/strict'

const { validateAnyWorkflowSource } = await import('../src/components/editor/anyworkflow-dsl.ts')

function errors(source) {
  return validateAnyWorkflowSource(source).filter((diagnostic) => diagnostic.severity === 'error')
}

function assertHasError(source, message) {
  const diagnostics = errors(source)
  assert.ok(diagnostics.length > 0, `expected an error for: ${message}`)
  return diagnostics
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

const validCodexPlan = `@run=Codex
@Codex Research {
  @event Prompt {
    @act {
      @action=Search
      { search the web }
    }
  }
}`
assert.equal(errors(validCodexPlan).length, 0, 'valid Codex plan should pass')

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
assertHasError(eventDirectiveInsideBrowserAct, 'browser @event directive inside an Act')

const nestedBrowserAct = `@run=Nested act
@task T {
  @event E {
    @act {
      @action=Outer
      @act {
        { hello }
      }
    }
  }
}`
assertHasError(nestedBrowserAct, 'nested browser Act')

const browserActionInsideLoop = `@run=Loop action
@task T {
  @event E {
    @for i in range(1, 2) {
      @action=Wrong
      { hello %i% }
    }
  }
}`
assertHasError(browserActionInsideLoop, 'browser Action inside a local loop')

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
