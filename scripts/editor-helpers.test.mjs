import assert from 'node:assert/strict'

const { offsetForLineColumn, sameIssues } = await import('../src/components/editor/editor-helpers.ts')

assert.equal(offsetForLineColumn('one\ntwo\nthree', 2, 2), 5)
assert.equal(offsetForLineColumn('one', 99, 99), 3)
assert.equal(offsetForLineColumn('one', 1, -4), 0)

const issue = { from: 1, to: 3, line: 1, severity: 'warning', message: '提示' }
assert.equal(sameIssues([issue], [{ ...issue }]), true)
assert.equal(sameIssues([issue], [{ ...issue, severity: 'error' }]), false)
assert.equal(sameIssues([issue], [{ ...issue, line: 2 }]), false)

console.log('editor helper assertions passed')
