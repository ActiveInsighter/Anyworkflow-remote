import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { nextDailyInstant, normalizeRecurrence } = await server.ssrLoadModule('/src/lib/recurrence.ts')
  const rule = { frequency: 'daily', time: '09:00', utcOffsetMinutes: 480 }
  assert.equal(nextDailyInstant(rule, Date.parse('2026-10-06T01:00:00Z')), '2026-10-07T01:00:00.000Z')
  assert.throws(() => normalizeRecurrence({ ...rule, time: '24:00' }))
  const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
  const api = await server.ssrLoadModule('/src/lib/api.ts')
  setSession({ token: 'fixture', record: { id: 'owner' }, baseUrl: 'https://pb.example.invalid' })
  let payload
  globalThis.fetch = async (_url, init) => { payload = JSON.parse(init.body); return Response.json({ ...payload }) }
  const tomorrow = nextDailyInstant(rule, Date.now())
  const plan = '@run=Daily\n@task Task {\n@event Event {\n{ hello }\n}\n}'
  await api.createRun(plan, 'draft', tomorrow, null, undefined, rule)
  assert.deepEqual(payload.recurrence, rule)
  const draft = await server.ssrLoadModule('/src/lib/draft.ts')
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  try {
    draft.writeEditorDraft('unfinished', { source: plan, title: 'Daily', mode: 'serial', maxConcurrency: 1, templateTitle: '', scheduledAt: '', recurrence: { ...rule, time: '' } })
    assert.equal(draft.readEditorDraft('unfinished').source, plan)
    assert.equal(draft.readEditorDraft('unfinished').recurrence.time, '')
  } finally { delete globalThis.localStorage }
  console.log('recurrence: fixed clock, validation and Run payload passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
