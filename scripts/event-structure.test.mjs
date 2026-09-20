import assert from 'node:assert/strict'

const { deriveEventProgress } = await import('../src/lib/event-structure.ts')
const { compactMessagePreview } = await import('../src/lib/history-display.ts')

const progress = deriveEventProgress(
  `@event=示例
@act {
  @action=准备
  { 第一条消息 }
  { 第二条消息 }
}
@act {
  @action=收尾
  { 第三条消息 }
}`,
  { index: 1, total: 3 },
  '',
)

assert.equal(progress.totalActs, 2)
assert.equal(progress.completedActs, 0)
assert.equal(progress.acts[0]?.completedMessages, 1)
assert.equal(progress.acts[0]?.state, 'running')
assert.equal(progress.acts[1]?.completedMessages, 0)

assert.equal(compactMessagePreview('第一行\n第二行\n第三行', 'Message 1'), '第一行 第二行 第三行')
assert.equal(compactMessagePreview('1234567890', 'Message 1', 6), '12345…')

console.log('event structure assertions passed')
