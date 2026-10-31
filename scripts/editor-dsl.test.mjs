import assert from 'node:assert/strict'

const { formatAnyWorkflowSource } = await import('../src/features/editor/lib/dsl-format.ts')
const { anyWorkflowCompletion } = await import('../src/features/editor/lib/dsl-completion.ts')
const { anyWorkflowLanguage } = await import('../src/features/editor/lib/dsl-language.ts')
const { validateWorkflowSource } = await import('../src/lib/workflow-dsl/index.ts')
const { EditorState } = await import('@codemirror/state')
const { StringStream } = await import('@codemirror/language')

const errors = (source) => validateWorkflowSource(source).filter((item) => item.severity === 'error')

// 1. Multi-line list headers inside an Event: items one level deeper, `] {` back at the header level.
const unformattedList = `@run=List
@task T {
@event E {
@for ch, t in [
(1, 绪论)
(2, 函数)
] {
{ 第%ch%章 %t% }
}
}
}`
const formattedList = `@run=List
@task T {
  @event E {
    @for ch, t in [
      (1, 绪论)
      (2, 函数)
    ] {
      { 第%ch%章 %t% }
    }
  }
}`
const onceFormatted = formatAnyWorkflowSource(unformattedList)
assert.equal(onceFormatted, formattedList, 'a multi-line list header re-indents its items one level below the @for')
assert.equal(formatAnyWorkflowSource(onceFormatted), onceFormatted, 'formatting a formatted list plan changes nothing')
assert.equal(errors(onceFormatted).length, 0, 'the formatted list plan is still valid')

// 2. List-loop completion detail for %index%, and the range-loop wording kept for comparison.
function completeAt(doc, pos) {
  const state = EditorState.create({ doc })
  return anyWorkflowCompletion({
    state,
    pos,
    explicit: true,
    matchBefore: (expression) => {
      const line = state.doc.lineAt(pos)
      const match = new RegExp(expression.source).exec(line.text.slice(0, pos - line.from))
      return match ? { from: line.from + match.index, to: pos, text: match[0] } : null
    },
  })
}

const listDoc = '@run=R\n@task T {\n  @event E {\n    @for item in [a, b] {\n      { %'
const listResult = completeAt(listDoc, listDoc.length)
const listDetails = Object.fromEntries(listResult.options.map((option) => [option.label, option.detail]))
assert.equal(listDetails['%index%'], '第几项，从 1 开始', 'index inside a list loop is the 1-based position')
assert.equal(listDetails['%item%'], '循环变量')
assert.equal(listDetails['%count%'], '本层循环的总次数', 'count is the total of its own loop')

const rangeDoc = '@run=R\n@task T {\n  @event E {\n    @for i in range(1, 3) {\n      { %'
const rangeDetails = Object.fromEntries(completeAt(rangeDoc, rangeDoc.length).options.map((option) => [option.label, option.detail]))
assert.equal(rangeDetails['%index%'], '循环值，同 %i%', 'index inside a range loop still repeats the value')

// 3. The Event-context directive list offers the list-loop snippet next to the range one.
const eventDirectiveDoc = '@run=R\n@task T {\n  @event E {\n    @\n  }\n}'
const directiveLabels = completeAt(eventDirectiveDoc, eventDirectiveDoc.indexOf('    @\n') + 5).options.map((option) => option.label)
assert.ok(directiveLabels.includes('@for … in [列表]'), 'the Event context offers a list loop snippet')
assert.ok(directiveLabels.includes('@for'), 'the Event context keeps the range loop snippet')

// 4. `in` is highlighted only in the header of a @for line, between the names and the source.
function tokensOf(line) {
  const parser = anyWorkflowLanguage.streamParser
  const state = parser.startState()
  const stream = new StringStream(line, 2, 2)
  const found = []
  while (!stream.eol()) {
    stream.start = stream.pos
    const style = parser.token(stream, state)
    if (style) found.push([stream.current(), style])
  }
  return found
}
const keywordsIn = (line) => tokensOf(line).filter(([text, style]) => style === 'keyword' && text === 'in').length
assert.equal(keywordsIn('    @for ch, t in ['), 1, 'the in of a multi-line list header is a keyword')
assert.equal(keywordsIn('@for i in range(1, 3) {'), 1, 'the in of a range header is a keyword')
assert.equal(keywordsIn('@for index in %secs% {'), 1, 'a loop name is not mistaken for the keyword')
assert.equal(keywordsIn('{ we go in the room }'), 0, 'in on a message line is not a keyword')
assert.equal(keywordsIn('@event=in the room'), 0, 'in on a directive line is not a keyword')
assert.equal(keywordsIn('@for i in range(1, 3) { in }'), 1, 'only the header in counts, not the one after the brace')

console.log('editor DSL assertions passed')
