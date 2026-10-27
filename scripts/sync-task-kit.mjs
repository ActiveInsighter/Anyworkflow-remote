// Vendor the platform-neutral async task kit from AnyWorkflow-workers.
//
//   node scripts/sync-task-kit.mjs [path/to/AnyWorkflow-workers]
//
// The kit (lifecycle, kind catalog, engine, retry policies, executors) is
// authored in AnyWorkflow-workers/src/platform/tasks and shared by the Node
// workers, the Cloudflare converter coordinator and this web console. Never
// edit shared/task-kit by hand: change the source, run this script, and commit
// both repositories. `npm test` fails when the copy and SOURCE.json disagree.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workers = path.resolve(root, process.argv[2] || process.env.WORKERS_DIR || '../AnyWorkflow-workers')
const source = path.join(workers, 'src/platform/tasks')
const target = path.join(root, 'shared/task-kit')

const files = (await readdir(source, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(mjs|d\.mts)$/u.test(entry.name))
  .map(entry => path.relative(source, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  .sort()
if (!files.includes('index.mjs')) throw new Error(`No task kit at ${source}`)

await rm(target, { recursive: true, force: true })
const checksums = {}
for (const file of files) {
  const bytes = await readFile(path.join(source, file))
  await mkdir(path.dirname(path.join(target, file)), { recursive: true })
  await writeFile(path.join(target, file), bytes)
  checksums[file] = createHash('sha256').update(bytes).digest('hex')
}
const manifest = { source: 'AnyWorkflow-workers/src/platform/tasks', files: checksums }
await writeFile(path.join(target, 'SOURCE.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Vendored ${files.length} task kit files from ${source}`)
