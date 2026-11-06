import assert from 'node:assert/strict'
import { nameFromFile, nameFromUrl } from '../src/features/file-converter/lib/source-name.ts'

assert.equal(nameFromFile('数学讲义.pdf'), '数学讲义')
assert.equal(nameFromFile('  Report.PDF '), 'Report')
assert.equal(nameFromFile(''), '')
assert.equal(nameFromFile(`${'长'.repeat(200)}.pdf`).length, 120, 'a suggested name must fit as a file name')

assert.equal(nameFromUrl('https://example.com/papers/book.pdf'), 'book')
assert.equal(nameFromUrl('https://example.com/a/%E8%AE%B2%E4%B9%89.pdf?download=1#page=2'), '讲义')
assert.equal(nameFromUrl('https://drive.google.com/file/d/abc/view'), '', 'share links name nothing')
assert.equal(nameFromUrl('not a url'), '')
assert.equal(nameFromUrl('https://example.com/%E0%A4%A.pdf'), '', 'a malformed escape names nothing')

console.log('source-name: task names from files and links ok')
