import assert from 'node:assert/strict'

const { deriveEventProgress } = await import('../src/lib/domain/event-structure.ts')

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

const nested = deriveEventProgress(
  `@event=嵌套
@for i in range(1, 2) {
  @event=卷
  @for j in range(1, 3) {
    { 第一条 %i%.%j% }
    { 第二条 }
  }
}
@for a in range(1, 2) {
  @for b in range(1, 2) {
    @for c in range(1, 2) {
      @event=格 %c%
      { 唯一 }
    }
  }
}`,
  { index: 7, total: 28 },
  '',
)
assert.equal(nested.totalActs, 14, '2*3 acts from the first nest plus 2*2*2 from the second')
assert.deepEqual(nested.acts.slice(0, 6).map((act) => act.title), Array(6).fill('卷'), 'inner loops inherit the enclosing @event title')
assert.deepEqual(nested.acts.slice(6).map((act) => act.title), Array(8).fill('格 %c%'))
assert.ok(nested.acts.slice(0, 6).every((act) => act.messageCount === 2), 'each nested act counts the messages of the innermost body')
assert.equal(nested.acts[3]?.completedMessages, 1, 'progress runs through nested acts in loop order')
assert.equal(nested.totalMessages, 28)

console.log('event structure assertions passed')
