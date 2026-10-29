import assert from 'node:assert/strict'
import { validateWorkflowSource as validateAnyWorkflowSource } from '../src/lib/workflow-dsl/index.ts'

for (const directive of ['@Codex', '@codex']) {
  const source = `@run=Unsupported\n${directive} Legacy {\n@event E {\n{ hello }\n}\n}`
  assert.ok(validateAnyWorkflowSource(source).some((item) => item.severity === 'error'))
}
console.log('retired executor rejection passed')
