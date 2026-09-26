import assert from 'node:assert/strict'
import { createServer } from 'vite'

const originalFetch = globalThis.fetch
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
  const api = await server.ssrLoadModule('/src/lib/api.ts')
  setSession({ token: 'test', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  const controller = new AbortController()
  const persisted = { id: 'message-real', owner: 'owner-1', act: 'act-1', nodeIndex: 17, status: 'succeeded' }
  let rows = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('filter'), 'act="act-1"')
    assert.equal(url.searchParams.get('sort'), '+nodeIndex,+id')
    assert.equal(url.searchParams.get('page'), '2')
    assert.equal(url.searchParams.get('perPage'), '20')
    assert.ok(url.searchParams.get('fields').includes('owner'))
    assert.ok(!url.searchParams.get('fields').includes('Markdown'), 'list excludes heavy message bodies')
    assert.equal(init.signal, controller.signal)
    return Response.json({ page: 2, perPage: 20, totalItems: rows.length, totalPages: 2, items: rows })
  }
  assert.equal((await api.listHistoryMessageSummariesForAct('act-1', 2, 20, controller.signal)).items.length, 0)
  rows = [persisted]
  assert.deepEqual((await api.listHistoryMessageSummariesForAct('act-1', 2, 20, controller.signal)).items, [persisted], 'only newly persisted rows appear; sparse node indexes are preserved')
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/api/collections/aw_messages/records/message-real')
    assert.equal(init.signal, controller.signal)
    return Response.json({ ...persisted, userMarkdown: 'question', assistantMarkdown: 'answer' })
  }
  assert.equal((await api.getHistoryMessage('message-real', 'act-1', controller.signal)).assistantMarkdown, 'answer')
  await assert.rejects(api.getHistoryMessage('message-real', 'another-act', controller.signal), /消息不属于当前 Act/)
  globalThis.fetch = async () => Response.json({ ...persisted, owner: 'another-owner' })
  await assert.rejects(api.getHistoryMessage('message-real', 'act-1'), /归属无效/)
  console.log('history-messages: persisted records, pagination, detail identity and ownership passed')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
