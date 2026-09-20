import assert from 'node:assert/strict'

const { planStructuredInsert, validateAnyWorkflowSource } = await import('../src/components/editor/anyworkflow-dsl.ts')

const source = `@run=Mixed\n\n@Codex Researcher {\n  @event Prompt {\n    { hello }\n  }\n}`
const diagnostics = validateAnyWorkflowSource(source)
assert.equal(diagnostics.filter((item) => item.severity === 'error').length, 0)

const insert = planStructuredInsert('@run=Mixed\n', 0, 'codex')
assert.equal(insert.ok, true)
if (insert.ok) assert.match(insert.text, /@Codex/u)

console.log('Codex DSL assertions passed')
