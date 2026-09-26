import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { nextRunTitle } = await server.ssrLoadModule('/src/lib/run-name.ts')
  const date = new Date(2026, 8, 27, 0, 5)
  assert.equal(nextRunTitle([], 0, date), '工作流 2026-09-27 #001')
  assert.equal(nextRunTitle(['工作流 2026-09-27 #009', '工作流 2026-09-26 #999'], 3, date), '工作流 2026-09-27 #010')
  assert.equal(nextRunTitle(['工作流 2026-09-27 #009 · 草稿'], 12, date), '工作流 2026-09-27 #013')
  assert.equal(nextRunTitle(['我的自定义工作流'], 0, date), '工作流 2026-09-27 #001')
  console.log('run-name: daily sequence, existing names, local reservations and custom titles passed')
} finally { await server.close() }
