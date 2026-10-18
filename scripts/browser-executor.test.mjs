import assert from 'node:assert/strict'
import { validateAnyWorkflowSource } from '../src/features/editor/lib/anyworkflow-dsl.ts'

for (const directive of ['@Codex', '@codex']) {
  const source = `@run=Unsupported\n${directive} Legacy {\n@event E {\n{ hello }\n}\n}`
  assert.ok(validateAnyWorkflowSource(source).some((item) => item.severity === 'error'))
}
console.log('retired executor rejection passed')
