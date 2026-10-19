import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { isChunkLoadError, reloadForNewBuild } = await server.ssrLoadModule('/src/lib/platform/chunk-reload.ts')

  // Messages browsers use when a deploy removed the chunk an old tab asks for.
  for (const message of [
    'Failed to fetch dynamically imported module: https://awremote.any1.tech/assets/dashboard-page-i2Tvi2AD.js',
    'error loading dynamically imported module: https://x/assets/a.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/index-abc.css',
  ]) {
    assert.ok(isChunkLoadError(new TypeError(message)), message)
  }
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false)
  assert.equal(isChunkLoadError(null), false)

  // One reload per guard window, so a genuinely missing chunk cannot loop.
  const store = new Map()
  let reloads = 0
  globalThis.sessionStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  globalThis.window = { location: { reload: () => reloads++ } }
  assert.equal(reloadForNewBuild(), true)
  assert.equal(reloadForNewBuild(), false)
  assert.equal(reloads, 1)
  console.log('chunk-reload: stale chunk errors recognised, single guarded reload passed')
} finally {
  delete globalThis.sessionStorage
  delete globalThis.window
  await server.close()
}
