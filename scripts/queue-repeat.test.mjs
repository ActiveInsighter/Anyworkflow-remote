import assert from 'node:assert/strict'
import { validateAnyWorkflowSource } from '../src/components/editor/anyworkflow-dsl.ts'

for (const executor of ['@task', '@Codex']) {
  const queueBodies = (count) => [
    `{ continue }*${count}`,
    `@act {\n{ continue }*${count}\n}`,
    ...(executor === '@task' ? [`{\n{ first }\n{ second }\n}*${count}`] : []),
  ]
  for (let bodyIndex = 0; bodyIndex < queueBodies(1).length; bodyIndex += 1) {
    for (const count of [1, 30, 31, 50, 99, 100]) {
      const body = queueBodies(count)[bodyIndex]
      const source = `@run=Repeat\n${executor} T {\n@event E {\n${body}\n}\n}`
      const errors = validateAnyWorkflowSource(source).filter((item) => item.severity === 'error')
      assert.deepEqual(errors, [], `${executor} ${body} should pass editor validation`)
    }
    for (const count of [0, 101]) {
      const body = queueBodies(count)[bodyIndex]
      const source = `@run=Repeat\n${executor} T {\n@event E {\n${body}\n}\n}`
      const errors = validateAnyWorkflowSource(source).filter((item) => item.severity === 'error')
      assert.ok(errors.some((item) => item.message.includes('1–100')), `*${count} should report the 1–100 range`)
    }
  }
}

console.log('queue-repeat tests passed')
