import assert from 'node:assert/strict'

const { deriveEventProgress } = await import('../src/lib/event-structure.ts')

const progress = deriveEventProgress(
  `@event=示例
@act {
  @event=准备
  { 第一条消息 }
  { 第二条消息 }
}
@act {
  @event=收尾
  { 第三条消息 }
}`,
  { index: 1, total: 3 },
  '',
)

assert.equal(progress.totalActs, 2)
assert.deepEqual(progress.acts.map((act) => act.title), ['准备', '收尾'])
assert.equal(progress.completedActs, 0)
assert.equal(progress.acts[0]?.completedMessages, 1)
assert.equal(progress.acts[0]?.state, 'running')
assert.equal(progress.acts[1]?.completedMessages, 0)

console.log('event structure assertions passed')
