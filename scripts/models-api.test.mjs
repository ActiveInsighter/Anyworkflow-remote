import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const originalFetch = globalThis.fetch
try {
  const { setSession } = await server.ssrLoadModule('/src/lib/api/session.ts')
  const { listSavedModels, saveModel, deleteSavedModel, refreshModelCatalog } = await server.ssrLoadModule('/src/lib/api/models.ts')
  const { getGeminiConfig, saveGeminiConfig } = await server.ssrLoadModule('/src/lib/api/gemini.ts')
  setSession({ token: 'test-token', record: { id: 'owner-1' }, baseUrl: 'https://pb.example.invalid' })
  let response, sent
  globalThis.fetch = async (url, options) => { sent = { url: String(url), options }; return Response.json(response ?? {}) }
  response = [{ id: 'saved', owner: 'other', modelId: 'gemini-latest' }]
  await assert.rejects(listSavedModels(), /归属/u)
  response = { items: [] }
  await assert.rejects(listSavedModels(), /格式/u)
  response = [{ id: 'saved', owner: 'owner-1', modelId: 'gemini-latest', name: 'Latest' }]
  assert.equal((await listSavedModels())[0].name, 'Latest')
  response = response[0]
  assert.equal((await saveModel('gemini-latest', 'Custom')).owner, 'owner-1')
  assert.deepEqual(JSON.parse(sent.options.body), { modelId: 'gemini-latest', name: 'Custom' })
  await deleteSavedModel('saved')
  assert.equal(sent.options.method, 'DELETE')
  response = { owner: 'owner-1', revision: 3, config: { model: 'gemini-latest' } }
  assert.equal((await getGeminiConfig()).revision, 3)
  await saveGeminiConfig(response.config, 3)
  assert.deepEqual(JSON.parse(sent.options.body), { expectedRevision: 3, config: response.config })
  await refreshModelCatalog()
  assert.equal(sent.url, '/api/models/catalog/refresh')
  assert.equal(sent.options.headers.Authorization, 'Bearer test-token')
  assert.equal(sent.options.headers['X-PocketBase-Url'], 'https://pb.example.invalid')
  setSession(null)
  console.log('models-api: authenticated metadata, isolated ownership, shared presets and config version transport passed')
} finally { globalThis.fetch = originalFetch; await server.close() }
