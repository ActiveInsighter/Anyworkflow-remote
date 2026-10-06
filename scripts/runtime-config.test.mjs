import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/session.ts')
  const { defaultRuntimeConfig } = await server.ssrLoadModule('/src/lib/runtime-config.ts')
  const { getRuntimeDefaults, saveRuntimeDefaults } = await server.ssrLoadModule('/src/lib/runtime-defaults.ts')
  const api = await server.ssrLoadModule('/src/lib/api.ts')
  setSession({ token: 'fixture', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  const config = defaultRuntimeConfig(); config.browser.replyTimeoutMinutes = 45
  let payload
  globalThis.fetch = async (_url, init) => {
    payload = init.body ? JSON.parse(init.body) : null
    return Response.json({ owner: 'owner-1', revision: 7, schemaVersion: 1, config })
  }
  assert.equal((await getRuntimeDefaults()).config.browser.replyTimeoutMinutes, 45)
  await saveRuntimeDefaults(config, 6)
  assert.deepEqual(payload, { config, expectedRevision: 6 })
  globalThis.fetch = async () => Response.json({ owner: 'other', revision: 1, schemaVersion: 1, config })
  await assert.rejects(getRuntimeDefaults(), /归属/)
  const plan = '@run=Example\n@task Task {\n@event Event {\n{ hello }\n}\n}'
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body)
    return Response.json({ ...payload, runtimeConfigChecksum: 'a'.repeat(64), runtimeDefaultRevision: 6 })
  }
  const run = await api.createRun(plan, 'draft', '', null, config)
  assert.deepEqual(payload.runtimeConfig, config)
  assert.deepEqual(run.runtimeConfig, config)
  const malformed = { ...config, schemaVersion: 2 }
  await assert.rejects(api.createRun(plan, 'draft', '', null, malformed), /runtimeConfig/)
  const { draftScopeFor, legacyDraftScopeFor, writeEditorDraft, readEditorDraft, clearEditorDraft } = await server.ssrLoadModule('/src/lib/draft.ts')
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  try {
    const first = draftScopeFor('https://first.example.invalid/', 'same-owner', 'same-run')
    const second = draftScopeFor('https://second.example.invalid', 'same-owner', 'same-run')
    assert.notEqual(first, second)
    assert.equal(legacyDraftScopeFor('same-owner', 'same-run'), 'same-owner:run:same-run')
    assert.equal(first, draftScopeFor('https://first.example.invalid', 'same-owner', 'same-run'))
    writeEditorDraft(first, { source: plan, title: 'Example', mode: 'serial', maxConcurrency: 1,
      templateTitle: '', scheduledAt: '', runtimeConfig: config })
    assert.equal(readEditorDraft(second), null)
    clearEditorDraft(second)
    assert.deepEqual(readEditorDraft(first).runtimeConfig, config)
  } finally { delete globalThis.localStorage }
  console.log('runtime-config: owner validation, revision writes and Run snapshots passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
