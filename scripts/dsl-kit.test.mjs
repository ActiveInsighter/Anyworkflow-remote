import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

const root = new URL('../shared/dsl-kit/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('SOURCE.json', root), 'utf8'))
const present = (await readdir(root)).filter(name => name !== 'SOURCE.json').sort()
assert.deepEqual(present, Object.keys(manifest.files).sort(), 'shared/dsl-kit files differ from SOURCE.json; run scripts/sync-dsl-kit.mjs')
for (const [file, checksum] of Object.entries(manifest.files)) {
  const actual = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex')
  assert.equal(actual, checksum, `shared/dsl-kit/${file} was edited locally; change AnyWorkflow-workers and re-sync`)
}
console.log('dsl-kit: vendored copy matches its manifest')
