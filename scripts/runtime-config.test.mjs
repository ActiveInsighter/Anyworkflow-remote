import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const { defaultRuntimeConfig, defaultModelSelection, normalizeRuntimeConfig } = await server.ssrLoadModule('/src/lib/domain/runtime-config.ts')
  const { getRuntimeDefaults, saveRuntimeDefaults } = await server.ssrLoadModule('/src/lib/api/runtime-defaults.ts')
  const api = await server.ssrLoadModule('/src/lib/api/index.ts')
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
  const { MODEL_CATALOG, findCatalogModel } = await server.ssrLoadModule('/src/features/runtime-config/lib/model-catalog.ts')
  assert.equal(findCatalogModel('claude', 'claude-sonnet-5-5').name, 'Sonnet 5.5', 'stable id resolves to the listed model')
  assert.equal(findCatalogModel('claude', 'Opus 5').name, 'Opus 5', 'Opus 5 is not confused with Opus 5.5')
  assert.equal(findCatalogModel('chatgpt', 'Sonnet 5.5'), null, 'models are per site')
  assert.deepEqual(findCatalogModel('claude', 'Haiku 4.5').efforts, [])
  for (const site of ['chatgpt', 'claude']) for (const model of MODEL_CATALOG[site]) {
    assert.doesNotThrow(() => normalizeRuntimeConfig({ ...config, schemaVersion: 2, modelSelection: { ...defaultModelSelection(2), [site]: { model: model.name, reasoningEffort: model.efforts[0] ?? null } } }), model.name)
  }
  assert.deepEqual(MODEL_CATALOG.chatgptCloud, [], 'the Codex cloud picker is not adapted, so nothing can be chosen')
  const v3 = { ...config, schemaVersion: 3, modelSelection: defaultModelSelection(3), defaultStartUrl: 'https://claude.ai/code' }
  assert.deepEqual(Object.keys(normalizeRuntimeConfig(v3)), ['schemaVersion', 'browser', 'modelSelection', 'defaultStartUrl'])
  assert.throws(() => normalizeRuntimeConfig({ ...v3, defaultStartUrl: 'http://claude.ai/' }), /defaultStartUrl/)
  assert.throws(() => normalizeRuntimeConfig({ ...v3, defaultStartUrl: '' }), /defaultStartUrl/)
  assert.throws(() => normalizeRuntimeConfig({ ...v3, modelSelection: defaultModelSelection(2) }), /fields/)
  assert.throws(() => normalizeRuntimeConfig({ ...v3, schemaVersion: 2 }), /fields/)
  const { composeRuntimeConfig } = await server.ssrLoadModule('/src/features/runtime-config/lib/compose-config.ts')
  const { surfaceOfUrl, START_LINKS } = await server.ssrLoadModule('/src/lib/domain/start-links.ts')
  assert.deepEqual(composeRuntimeConfig(config.browser, defaultModelSelection(), null), { schemaVersion: 1, browser: config.browser }, 'untouched config stays v1')
  assert.deepEqual(composeRuntimeConfig(config.browser, defaultModelSelection(), 'https://chatgpt.com/'), { schemaVersion: 1, browser: config.browser }, 'the built-in default start link adds nothing')
  const picked = { ...defaultModelSelection(), claude: { model: 'Opus 5.5', reasoningEffort: 'high' } }
  assert.equal(composeRuntimeConfig(config.browser, picked, null).schemaVersion, 2, 'chat model choices stay v2 for older extensions')
  assert.deepEqual(Object.keys(composeRuntimeConfig(config.browser, picked, null).modelSelection), ['chatgpt', 'claude'])
  assert.equal(composeRuntimeConfig(config.browser, picked, 'https://claude.ai/code').schemaVersion, 3)
  assert.equal(composeRuntimeConfig(config.browser, defaultModelSelection(), 'https://claude.ai/new').defaultStartUrl, 'https://claude.ai/new')
  for (const link of START_LINKS) {
    assert.equal(surfaceOfUrl(link.url), link.surface, `${link.label} maps to its model surface`)
    assert.doesNotThrow(() => normalizeRuntimeConfig(composeRuntimeConfig(config.browser, defaultModelSelection(), link.url)), link.label)
  }
  assert.equal(surfaceOfUrl('https://evil.example/cloud'), null)
  assert.equal(surfaceOfUrl('http://chatgpt.com/'), null)
  const plan = '@run=Example\n@task Task {\n@event Event {\n{ hello }\n}\n}'
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body)
    return Response.json({ ...payload, runtimeConfigChecksum: 'a'.repeat(64), runtimeDefaultRevision: 6 })
  }
  const run = await api.createRun(plan, 'draft', '', null, config)
  assert.deepEqual(payload.runtimeConfig, config)
  assert.deepEqual(run.runtimeConfig, config)
  const v2 = { ...config, schemaVersion: 2, modelSelection: {
    chatgpt: { model: ' GPT-6 ', reasoningEffort: 'high' }, claude: { model: null, reasoningEffort: null } } }
  const v2Normalized = normalizeRuntimeConfig(v2)
  assert.equal(v2Normalized.modelSelection.chatgpt.model, 'GPT-6')
  assert.deepEqual(Object.keys(v2Normalized), ['schemaVersion', 'browser', 'modelSelection'])
  assert.throws(() => normalizeRuntimeConfig({ ...v2, modelSelection: { ...v2.modelSelection, claude: { model: '', reasoningEffort: null } } }), /claude\.model/)
  assert.throws(() => normalizeRuntimeConfig({ ...v2, modelSelection: { ...v2.modelSelection, claude: { model: null, reasoningEffort: 'x' } } }), /reasoningEffort/)
  assert.throws(() => normalizeRuntimeConfig({ ...config, modelSelection: v2.modelSelection }), /fields/)
  globalThis.fetch = async () => Response.json({ owner: 'owner-1', revision: 9, schemaVersion: 2, config: v2 })
  assert.equal((await getRuntimeDefaults()).config.schemaVersion, 2)
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body)
    return Response.json({ ...payload, runtimeConfig: v2, runtimeConfigChecksum: 'a'.repeat(64), runtimeDefaultRevision: 9 })
  }
  assert.equal((await api.createRun(plan, 'draft', '', null, v2)).runtimeConfig.modelSelection.chatgpt.reasoningEffort, 'high')
  const malformed = { ...config, schemaVersion: 2 }
  await assert.rejects(api.createRun(plan, 'draft', '', null, malformed), /runtimeConfig/)
  const { draftScopeFor, legacyDraftScopeFor, writeEditorDraft, readEditorDraft, clearEditorDraft } = await server.ssrLoadModule('/src/features/run-editor/lib/editor-draft.ts')
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
