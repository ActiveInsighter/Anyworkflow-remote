import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession, getSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const api = await server.ssrLoadModule('/src/lib/api/run-exports.ts')
  const session = { token: 'fixture-token', record: { id: 'owner' }, baseUrl: 'https://pb.example.invalid' }
  setSession(session)
  const job = { id: 'export000000001', owner: 'owner', run: 'run', title: 'test', contentMode: 'conversation', status: 'queued', progress: 0, messageCount: 0, documentCount: 0, file: '', fileSize: 0, warnings: null, expiresAt: '', created: new Date().toISOString() }
  const calls = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    calls.push({ url, init })
    if (init.method === 'POST') return Response.json(job)
    return Response.json({ items: [job], page: 1, perPage: 10, totalItems: 1, totalPages: 1 })
  }
  await api.listRunExports('run', 2)
  assert.ok(calls[0].url.searchParams.get('filter').includes('owner="owner" && run="run"'))
  assert.equal(calls[0].url.searchParams.get('page'), '2')
  await api.createRunExport(job.id, 'run', 'conversation')
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { id: job.id, owner: 'owner', run: 'run', contentMode: 'conversation', status: 'queued' })
  let posts = 0
  globalThis.fetch = async (input, init) => {
    if (init.method === 'POST') { posts++; throw new Error('lost acknowledgement') }
    return Response.json(job)
  }
  assert.equal((await api.createRunExport(job.id, 'run', 'conversation')).id, job.id)
  assert.equal(posts, 1)
  await assert.rejects(api.createRunExport(job.id, 'run', 'assistant'), /无法连接/)
  await assert.rejects(api.createRunExport('invalid', 'run', 'assistant'), /参数无效/)
  globalThis.fetch = async () => Response.json({ items: [{ ...job, owner: 'other' }] })
  await assert.rejects(api.listRunExports('run', 1), /归属无效/)
  globalThis.fetch = async () => Response.json({ items: [{ ...job, run: 'other-run' }] })
  await assert.rejects(api.listRunExports('run', 1), /格式无效/)
  const completed = { ...job, status: 'succeeded', file: '中文 对话.zip', fileSize: 3, messageCount: 1, documentCount: 1, expiresAt: new Date(Date.now() + 60_000).toISOString() }
  let fileUrl
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname === '/api/files/token') return Response.json({ token: 'short-lived' })
    fileUrl = url
    return new Response(new Uint8Array([80, 75, 3]))
  }
  const blob = await api.downloadRunExport(completed)
  assert.equal(blob.size, 3)
  assert.equal(fileUrl.searchParams.get('token'), 'short-lived')
  assert.equal(fileUrl.origin, session.baseUrl)
  assert.equal(decodeURIComponent(fileUrl.pathname.split('/').at(-1)), completed.file)
  await assert.rejects(api.downloadRunExport({ ...completed, expiresAt: '2020-01-01T00:00:00Z' }), /已过期/)
  globalThis.fetch = async input => new URL(input).pathname.endsWith('/token') ? Response.json({ token: 'short-lived' }) : new Response('truncated')
  await assert.rejects(api.downloadRunExport(completed), /不完整/)
  globalThis.fetch = async input => new URL(input).pathname.endsWith('/token') ? Response.json({ token: 'short-lived' }) : new Response('x', { headers: { 'Content-Length': '104857601' } })
  await assert.rejects(api.downloadRunExport(completed), /上限/)
  globalThis.fetch = async () => { setSession({ ...session, token: 'new-token' }); return Response.json({ token: 'old-file-token' }) }
  await assert.rejects(api.downloadRunExport(completed), /账户已切换/)
  setSession(session)
  globalThis.fetch = async () => Response.json({ message: '请重新登录' }, { status: 401 })
  await assert.rejects(api.createRunExport(job.id, 'run', 'conversation'), /请重新登录/)
  assert.equal(getSession(), null)
  console.log('PASS: Run export scoping, idempotent create, owner checks, protected download, size limits, account changes and auth expiry')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
