import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
  const api = await server.ssrLoadModule('/src/lib/api.ts')
  setSession({ token: 'test', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  const planText = '@run=Example\n@task Task {\n@event Event {\n{ hello }\n}\n}'
  let parent = { id: 'parent', owner: 'owner-1', planText, status: 'succeeded', title: 'Example' }
  let writes = []
  globalThis.fetch = async (input, init) => {
    if (init.method === 'GET') return Response.json(parent)
    writes.push({ method: init.method, body: JSON.parse(init.body) })
    return Response.json({ ...writes.at(-1).body, versionMajor: 2, versionMinor: 0 })
  }
  for (const status of ['draft', 'queued']) {
    const saved = await api.createEditedRun('parent', planText, status)
    assert.equal(saved.status, status)
    assert.equal(writes.at(-1).method, 'POST', 'terminal records are never patched')
    assert.equal(writes.at(-1).body.parentRun, 'parent')
    assert.equal(writes.at(-1).body.origin, 'edited_rerun', 'unchanged edits still create a major version')
    assert.ok(!('versionMajor' in writes.at(-1).body), 'server allocates versions')
  }
  parent.status = 'running'
  await assert.rejects(api.createEditedRun('parent', planText, 'draft'), /结束/)
  assert.equal(writes.length, 2)
  console.log('run-edit: unchanged forks, save/run, immutable source and active-run guard passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
