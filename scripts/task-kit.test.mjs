import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { TASK_KINDS, fileConversionKind, runExportKind, runKind } from '../shared/task-kit/index.mjs'

// The vendored kit must match its manifest: edits belong in AnyWorkflow-workers.
const root = new URL('../shared/task-kit/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('SOURCE.json', root), 'utf8'))
const present = (await readdir(root, { recursive: true })).filter(file => /\.(mjs|d\.mts)$/u.test(file)).sort()
assert.deepEqual(present, Object.keys(manifest.files).sort(), 'shared/task-kit files differ from SOURCE.json; run scripts/sync-task-kit.mjs')
for (const [file, checksum] of Object.entries(manifest.files)) {
  const actual = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex')
  assert.equal(actual, checksum, `shared/task-kit/${file} was edited locally; change AnyWorkflow-workers and re-sync`)
}

// The console reads every kind through the same canonical view.
assert.equal(TASK_KINDS.find(kind => kind.collection === 'aw_pdf_to_md_jobs'), fileConversionKind)
assert.equal(fileConversionKind.describe({ status: 'uploading', cancelRequested: true }).stopping, true)
assert.equal(runExportKind.describe({ status: 'collecting', progress: 30 }).progress, 30)
assert.equal(runKind.describe({ status: 'draft' }).state, 'idle')
console.log('task-kit: vendored copy matches its manifest; kinds describe conversions, exports and Runs')
