import assert from 'node:assert/strict'
import { readdir, readFile, mkdir, rm } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { workerModules } from './upload-worker-harness.mjs'
import { createServer } from 'vite'

const config = JSON.parse(await readFile(new URL('../wrangler.converter.jsonc', import.meta.url), 'utf8'))
const modules = await Promise.all((await readdir(new URL('../converter-worker/', import.meta.url)))
  .filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts')).map(async name => ({
    type: 'ESModule', path: `converter-worker/${name.replace(/\.ts$/u, '.js')}`,
    contents: stripTypeScriptTypes(await readFile(new URL(`../converter-worker/${name}`, import.meta.url), 'utf8')),
  })))
// The coordinator runs the vendored task kit; load it exactly as wrangler bundles it.
for (const name of (await readdir(new URL('../shared/task-kit/', import.meta.url), { recursive: true })).filter(file => file.endsWith('.mjs'))) {
  modules.push({ type: 'ESModule', path: `shared/task-kit/${name}`, contents: await readFile(new URL(`../shared/task-kit/${name}`, import.meta.url), 'utf8') })
}
const rows = [], dispatches = [], uploads = [], cancellations = []
let runReads = 0
let uncertainDispatch = false, completed = false, conclusion = 'success', archiveAvailable = true
const zip = new Uint8Array([80, 75, 3, 4, 10, 20, 30, 40])
const pb = config.vars.POCKETBASE_URL
const persist = new URL(`../.deployment-evidence/converter-test-${crypto.randomUUID()}/`, import.meta.url)
await mkdir(persist, { recursive: true })
function row(id, status = 'queued') {
  return { id, status, sourceUrl: 'https://example.invalid/file.pdf', outputName: '中文文档', systemPrompt: 'system', prompt: 'per-job', options: { concurrency: 5, start_page: 1, end_page: 1, adjacent_pages: true, ref: 'old-branch' } }
}
async function outbound(request) {
  const url = new URL(request.url)
  if (url.origin === pb) {
    if (url.pathname.endsWith('/auth-refresh')) {
      assert.equal(request.headers.get('authorization'), 'client-token')
      return Response.json({ record: { id: 'owner', collectionName: 'aw_clients' } })
    }
    assert.equal(request.headers.get('authorization'), 'Bearer pb-service')
    const id = url.pathname.split('/records/')[1]
    if (!id) {
      const filter = url.searchParams.get('filter')
      return Response.json({ items: rows.filter(item => filter.includes(`status="${item.status}"`)).slice(0, 10) })
    }
    const item = rows.find(item => item.id === id)
    assert.ok(item)
    if (request.method === 'PATCH') {
      if (request.headers.get('content-type').startsWith('multipart/')) {
        const form = await request.formData()
        assert.deepEqual(new Uint8Array(await form.get('file').arrayBuffer()), zip)
        assert.equal(form.get('file').name, '中文文档.zip')
        assert.equal(form.get('fileSize'), String(zip.byteLength))
        for (const [key, value] of form) if (key !== 'file') item[key] = value
        uploads.push(id)
      } else Object.assign(item, await request.json())
    }
    return Response.json(item)
  }
  if (url.hostname.endsWith('.blob.core.windows.net')) {
    assert.equal(request.headers.has('authorization'), false)
    return new Response(zip, { headers: { 'content-length': String(zip.length) } })
  }
  assert.equal(url.hostname, 'api.github.com')
  assert.equal(request.headers.get('authorization'), 'Bearer github-service')
  assert.equal(request.headers.get('user-agent'), 'AnyWorkflow-File-Converter')
  if (url.pathname.endsWith('/dispatches')) {
    assert.equal(rows.find(item => item.status === 'dispatching')?.id, rows[dispatches.length].id)
    const body = await request.json()
    assert.equal(body.ref, 'main')
    assert.equal(body.inputs.ref, undefined)
    assert.equal(body.inputs.system_prompt, 'system')
    assert.equal(body.inputs.prompt, 'per-job')
    assert.equal(body.inputs.start_page, '1')
    assert.equal(body.inputs.adjacent_pages, 'true')
    dispatches.push(body)
    return uncertainDispatch ? new Response(null, { status: 502 }) : Response.json({ workflow_run_id: 100 + dispatches.length })
  }
  if (url.pathname.endsWith('/cancel')) { cancellations.push(url.pathname); return new Response(null, { status: 409 }) }
  if (url.pathname.endsWith('/artifacts')) return Response.json({ artifacts: archiveAvailable ? [{ id: 1, name: `file-converter-pdf-to-md-${url.pathname.split('/').at(-2)}`, size_in_bytes: zip.length }] : [] })
  if (url.pathname.endsWith('/zip')) return new Response(null, { status: 302, headers: { location: 'https://test.blob.core.windows.net/signed' } })
  if (url.pathname.endsWith('/runs')) return Response.json({ workflow_runs: [{ id: 102, display_title: `file-converter-pdf-to-md-${rows[1].id}`, status: 'in_progress' }] })
  runReads++
  return Response.json({ id: 101, status: completed ? 'completed' : 'in_progress', conclusion, head_branch: 'main', head_sha: 'a'.repeat(40) })
}
const mainModules = await workerModules()
function runtime() {
  return new Miniflare({ ...convertV4MiniflareOptions({
    workers: [{
      name: config.name, compatibilityDate: config.compatibility_date,
      modules: [{ type: 'ESModule', path: 'test-entry.js', contents: `
        import handler, { ConversionCoordinator } from './converter-worker/index.js';
        export class TestCoordinator extends ConversionCoordinator { async tick() { await this.alarm() } }
        export default { ...handler, async fetch(request, env, ctx) {
          if (new URL(request.url).pathname === '/tick') { await env.CONVERSION_COORDINATOR.getByName('production').tick(); return new Response('ok'); }
          return handler.fetch(request, env, ctx);
        } };
      ` }, ...modules],
      bindings: { ...config.vars, GITHUB_FILE_CONVERTER_TOKEN: 'github-service', POCKETBASE_SERVER_TOKEN: 'pb-service', GITHUB_FILE_CONVERTER_REF: 'old-branch' },
      durableObjects: { CONVERSION_COORDINATOR: { className: 'TestCoordinator', useSQLite: true } },
      outboundService: outbound,
    }, {
      name: 'remote', compatibilityDate: '2026-09-18',
      modules: [{ type: 'ESModule', path: 'remote-entry.js', contents: "export { default } from './worker/index.js'" }, ...mainModules],
      bindings: { POCKETBASE_URL: pb },
      serviceBindings: { FILE_CONVERTER: config.name },
      outboundService: outbound,
    }],
  }), resourcePersistencePath: persist.pathname })
}
let mf = runtime()
const request = (path, init) => mf.dispatchFetch(`https://internal.invalid${path}`, init)
const tick = async () => {
  const response = await request('/tick')
  assert.equal(response.status, 200, await response.text())
}
try {
  // Exercise the real alarm, multiple notifications, and the production service binding route.
  rows.push(row('aaaaaaaaaaaaaaa'), row('bbbbbbbbbbbbbbb'))
  const remote = await mf.getWorker('remote')
  assert.equal((await remote.fetch('https://remote.invalid/api/file-conversion/wake', { method: 'POST' })).status, 401)
  assert.equal((await remote.fetch('https://remote.invalid/api/file-conversion/wake', {
    method: 'POST', headers: { Authorization: 'Bearer client-token', 'X-PocketBase-Url': 'https://evil.invalid' },
  })).status, 400)
  const wakeRequest = () => remote.fetch('https://remote.invalid/api/file-conversion/wake', {
    method: 'POST', headers: { Authorization: 'Bearer client-token', 'X-PocketBase-Url': pb },
  })
  assert.equal((await wakeRequest()).status, 202)
  await Promise.all(Array.from({ length: 8 }, wakeRequest))
  const deadline = Date.now() + 10_000
  while (rows[0].status !== 'pending' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(rows[0].status, 'pending')
  assert.equal(dispatches.length, 1)
  assert.equal(rows[1].status, 'queued')

  // Persisted DO state survives a runtime restart; the accepted job is not dispatched again.
  const before = await (await request('/status')).json()
  assert.equal(before.ref, 'main')
  await mf.dispose()
  mf = runtime()
  assert.deepEqual(await (await request('/status')).json(), before)
  await tick()
  assert.equal(dispatches.length, 1)

  // Cancellation waits for a terminal run and preserves partial output.
  rows[0].cancelRequested = true
  await tick()
  assert.equal(cancellations.length, 1)
  completed = true
  conclusion = 'cancelled'
  uncertainDispatch = true
  await tick()
  assert.equal(rows[0].status, 'canceled')
  assert.deepEqual(uploads, ['aaaaaaaaaaaaaaa'])
  assert.equal(rows[1].status, 'dispatching')
  assert.equal(dispatches.length, 2)

  // A lost dispatch response is reconciled, never resent, including after restart.
  await tick()
  assert.equal(rows[1].githubRunId, '102')
  assert.equal(dispatches.length, 2)
  conclusion = 'failure'
  await tick()
  assert.equal(rows[1].status, 'partial')
  assert.deepEqual(uploads, ['aaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbb'])

  // Missing artifacts on a successful run stay retryable rather than losing the output.
  rows.push({ ...row('ccccccccccccccc', 'running'), githubRunId: '103' })
  conclusion = 'success'
  archiveAvailable = false
  await tick()
  assert.equal(rows[2].status, 'uploading')
  assert.equal(rows[2].syncFailures, 1)
  archiveAvailable = true
  await tick()
  assert.equal(rows[2].status, 'succeeded')
  // PocketBase bounds each list page: queued records must never hide the active run.
  rows.length = 0
  rows.push(...Array.from({ length: 12 }, (_, i) => row(`queue${String(i).padStart(10, '0')}`)), { ...row('ddddddddddddddd', 'running'), githubRunId: '999' })
  completed = false
  const previousReads = runReads
  await tick()
  assert.equal(runReads, previousReads + 1, 'a backlog larger than one page still advances the running job')
  assert.equal(dispatches.length, 2, 'backlog cannot create overlapping Actions runs')
  console.log('converter-worker: real alarm, authenticated service wake, main ref, single dispatch, restart recovery, cancellation and streaming ZIP sync passed')
} finally {
  await mf.dispose()
  await rm(persist, { recursive: true, force: true })
}

// Streaming guards must reject truncated, overlong and non-ZIP responses, including split signatures.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { archiveMultipart } = await server.ssrLoadModule('/converter-worker/store.ts')
  const { createGitHub } = await server.ssrLoadModule('/converter-worker/github.ts')
  function archive(bytes, size = bytes.length) {
    return { size, response: new Response(new ReadableStream({
      start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close() },
    })) }
  }
  for (const [bytes, size, error] of [
    [[80, 75, 3, 4], 5, /length mismatch/u],
    [[80, 75, 3, 4, 5], 4, /exceeds declared length/u],
    [[80, 75, 3, 9], 4, /ZIP signature/u],
  ]) {
    const { stream } = archiveMultipart(archive(bytes, size), 'x.zip', {})
    await assert.rejects(new Response(stream).arrayBuffer(), error)
  }
  const { stream, contentType } = archiveMultipart(archive([...zip]), 'x.zip', {})
  const form = await new Response(stream, { headers: { 'Content-Type': contentType } }).formData()
  assert.deepEqual(new Uint8Array(await form.get('file').arrayBuffer()), zip)

  const env = { ...config.vars, GITHUB_FILE_CONVERTER_TOKEN: 'private-token' }
  let requests = 0
  const github = createGitHub(env, async url => {
    requests++
    if (String(url).includes('/artifacts?')) return Response.json({ artifacts: [{ id: 1, name: 'file-converter-pdf-to-md-123', size_in_bytes: 4 }] })
    return new Response(null, { status: 302, headers: { location: 'https://evil.invalid/stolen' } })
  })
  await assert.rejects(github.archive('123'), /download host/u)
  assert.equal(requests, 2, 'untrusted artifact host is never fetched')
  console.log('converter-stream: split ZIP signatures, exact lengths and trusted storage redirects passed')
} finally { await server.close() }
