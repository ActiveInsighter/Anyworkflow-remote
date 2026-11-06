import assert from 'node:assert/strict'
import { parseInlines, parseMarkdown } from '../src/features/page-capture/lib/markdown-blocks.ts'

const kinds = (markdown) => parseMarkdown(markdown).map((block) => block.kind)

// Block structure, including what a blank line does and does not end.
assert.deepEqual(kinds('# 标题\n\n段落一\n接着一行\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n> 引用\n\n---\n'), ['heading', 'paragraph', 'list', 'list', 'quote', 'rule'])
assert.equal(parseMarkdown('段落一\n接着一行')[0].inlines[0].text, '段落一 接着一行')
assert.deepEqual(parseMarkdown('###### 六级').map((block) => block.level), [4], 'deep headings stay inside the reader scale')
assert.equal(parseMarkdown('1. 一\n2. 二')[0].ordered, true)
assert.equal(parseMarkdown('- 甲\n- 乙')[0].items.length, 2)
assert.deepEqual(kinds('段落\n# 标题'), ['paragraph', 'heading'], 'a heading ends the paragraph above it')

// Fences keep their content verbatim, unclosed ones included: nothing inside is Markdown.
assert.deepEqual(parseMarkdown('```js\n# 不是标题\n**不加粗**\n```'), [{ kind: 'code', text: '# 不是标题\n**不加粗**' }])
assert.deepEqual(parseMarkdown('```\n未闭合'), [{ kind: 'code', text: '未闭合' }])

// Inline marks.
assert.deepEqual(parseInlines('甲 **粗** 乙 *斜* 丙 `码`'), [
  { kind: 'text', text: '甲 ' }, { kind: 'strong', text: '粗' }, { kind: 'text', text: ' 乙 ' },
  { kind: 'emphasis', text: '斜' }, { kind: 'text', text: ' 丙 ' }, { kind: 'code', text: '码' },
])
assert.deepEqual(parseInlines('[下一篇](https://example.com/next "标题")'), [{ kind: 'link', text: '下一篇', href: 'https://example.com/next' }])

// Untrusted input stays data. Images never carry their address, so nothing can be fetched from
// them; raw HTML is ordinary text; a script link keeps its href only for the caller to reject.
assert.deepEqual(parseInlines('![配图](https://tracker.example/pixel.gif)'), [{ kind: 'image', text: '配图' }])
assert.deepEqual(parseMarkdown('<img src=x onerror="alert(1)">'), [{ kind: 'paragraph', inlines: [{ kind: 'text', text: '<img src=x onerror="alert(1)">' }] }])
assert.deepEqual(parseInlines('[点我](javascript:alert(1))')[0], { kind: 'link', text: '点我', href: 'javascript:alert(1' })

// Hostile shapes finish, and a page-sized article stays quick.
assert.deepEqual(parseMarkdown(''), [])
assert.deepEqual(parseMarkdown('\n\n  \n'), [])
const hostile = {
  'unclosed link targets': '[a]('.repeat(20_000),
  'unclosed brackets': '['.repeat(50_000),
  'unclosed images': '!['.repeat(25_000),
  'unclosed code': '`a '.repeat(20_000),
  'a run of asterisks': '*'.repeat(50_000),
  'asterisks without a close': '*a '.repeat(20_000),
  'bold without a close': '**a '.repeat(20_000),
  'a heading of spaces': `# a${' '.repeat(50_000)}b`,
  'a heading of hashes': `# a ${'#'.repeat(50_000)} b`,
  'many quotes': '> 引用\n'.repeat(20_000),
  'a long rule look-alike': `${'- '.repeat(25_000)}x`,
}
for (const [name, text] of Object.entries(hostile)) {
  const started = performance.now()
  parseMarkdown(text)
  const elapsed = performance.now() - started
  assert.ok(elapsed < 500, `${name} took ${Math.round(elapsed)}ms`)
}
assert.equal(parseMarkdown('## 标题 ##')[0].inlines[0].text, '标题')
assert.equal(parseMarkdown('# C#')[0].inlines[0].text, 'C#', 'a # that belongs to the word stays')

console.log('markdown-blocks: structure, verbatim code, inline marks and untrusted input ok')
