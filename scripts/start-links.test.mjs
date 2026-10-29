import assert from 'node:assert/strict'

const {
  DEFAULT_START_LINKS,
  START_LINK_LIMITS,
  displayStartUrl,
  normalizeStartLinks,
  sameStartLinks,
  validateStartLink,
} = await import('../src/lib/domain/start-links.ts')
const { RUNTIME_PAGES } = await import('../src/lib/domain/runtime-pages.ts')

assert.deepEqual(DEFAULT_START_LINKS.map((link) => link.url), RUNTIME_PAGES.map((page) => page.url), 'defaults are the runtime pages')
assert.equal(normalizeStartLinks(undefined), null, 'nothing stored means "use the defaults"')
assert.equal(normalizeStartLinks({}), null)
assert.deepEqual(normalizeStartLinks([]), [], 'an emptied list stays empty')

const stored = normalizeStartLinks([
  { id: 'a', label: '  我的   工作台 ', url: ' https://example.com/desk ' },
  { id: 'a', label: '重复 id', url: 'https://example.com/other' },
  { id: 'b', label: '重复链接', url: 'https://example.com/desk' },
  { id: 'c', label: '不安全', url: 'http://example.com/' },
  { id: 'd', label: '', url: 'https://example.com/empty' },
  { id: '<bad id>', label: '坏 id', url: 'https://example.com/bad-id' },
  null,
  'text',
])
assert.deepEqual(stored.map((link) => [link.label, link.url]), [
  ['我的 工作台', 'https://example.com/desk'],
  ['重复 id', 'https://example.com/other'],
  ['坏 id', 'https://example.com/bad-id'],
], 'bad entries are dropped one by one, not the whole list')
assert.equal(new Set(stored.map((link) => link.id)).size, stored.length, 'ids are made unique')
assert.equal(stored[0].id, 'a')
assert.match(stored[2].id, /^[A-Za-z0-9_-]+$/u)

const many = Array.from({ length: 50 }, (_, index) => ({ id: `x${index}`, label: `L${index}`, url: `https://example.com/${index}` }))
assert.equal(normalizeStartLinks(many).length, START_LINK_LIMITS.maxLinks)

assert.deepEqual(validateStartLink({ label: '', url: '' }, []), { label: '请填写名称', url: '请填写链接' })
assert.deepEqual(validateStartLink({ label: 'x'.repeat(41), url: 'http://a.b' }, []), {
  label: '名称最多 40 个字',
  url: '请填写以 https:// 开头的完整链接',
})
assert.deepEqual(validateStartLink({ label: 'ok', url: 'https://example.com/desk' }, stored), { url: '这个链接已经在列表中' })
assert.deepEqual(validateStartLink({ label: 'ok', url: 'https://example.com/new?x=1#top' }, stored), {})

assert.equal(sameStartLinks(stored, stored.map((link) => ({ ...link }))), true)
assert.equal(sameStartLinks(stored, [...stored].reverse()), false)
assert.equal(displayStartUrl('https://chatgpt.com/'), 'chatgpt.com')
assert.equal(displayStartUrl('https://claude.ai/code/'), 'claude.ai/code')
assert.equal(displayStartUrl('not a url'), 'not a url')

console.log('start links: defaults, lenient reads, validation and display ok')
