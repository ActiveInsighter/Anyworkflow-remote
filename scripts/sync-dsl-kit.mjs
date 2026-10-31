// Vendor the DSL loop kit from AnyWorkflow-workers.
//
//   node scripts/sync-dsl-kit.mjs [path/to/AnyWorkflow-workers]
//
// `@for` headers and loop sources are implemented once, in
// AnyWorkflow-workers/src/platform/dsl, and copied byte for byte into this
// editor, the MCP server and the browser extension, so none of them can read a
// loop differently. Never edit shared/dsl-kit by hand: change the source, run
// this script, and commit both repositories. `npm test` fails when the copy and
// SOURCE.json disagree.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workers = path.resolve(root, process.argv[2] || process.env.WORKERS_DIR || '../AnyWorkflow-workers')
const source = path.join(workers, 'src/platform/dsl')
const target = path.join(root, 'shared/dsl-kit')

const files = (await readdir(source)).filter(name => /\.(mjs|d\.mts)$/u.test(name)).sort()
if (!files.includes('loops.mjs')) throw new Error(`No DSL kit at ${source}`)

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
const checksums = {}
for (const file of files) {
  const bytes = await readFile(path.join(source, file))
  await writeFile(path.join(target, file), bytes)
  checksums[file] = createHash('sha256').update(bytes).digest('hex')
}
const manifest = { source: 'AnyWorkflow-workers/src/platform/dsl', files: checksums }
await writeFile(path.join(target, 'SOURCE.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Vendored ${files.length} DSL kit files from ${source}`)
