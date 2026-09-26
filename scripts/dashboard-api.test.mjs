import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
  const { listRuns } = await server.ssrLoadModule('/src/lib/api.ts')
  setSession({ token: 'test', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  let filter
  globalThis.fetch = async input => {
    filter = new URL(input).searchParams.get('filter')
    return Response.json({ items: [], page: 1, perPage: 20, totalPages: 0, totalItems: 0 })
  }
  await listRuns(1, 20, 'failed', 'a" || status="running')
  assert.ok(filter.includes('status="failed"'))
  assert.ok(filter.includes('title~"a\\" || status=\\"running"'))
  assert.ok(filter.includes('owner="owner-1"'))
  await listRuns(1, 20, 'canceled')
  assert.ok(filter.includes('status="canceled"'))
  await listRuns(1, 20, 'done')
  assert.ok(filter.includes('status="succeeded"'))
  assert.ok(!filter.includes('status="failed"'))
  console.log('dashboard-api: status filters and escaped server-side search passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
