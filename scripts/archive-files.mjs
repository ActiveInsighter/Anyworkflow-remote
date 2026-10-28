import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const CHUNK_SIZE = 24 * 1024 * 1024
export const MAX_ASSETS = 20_000
const scopes = ['library', 'relay']
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex')
export const assetPath = hash => `/chunks/${hash}.bin`

/** Full manifests are mandatory: every deployment retains committed and crash-recovery records. */
export function buildManifest(records) {
  const manifest = {}
  for (const record of records) {
    if (record.v !== 1 || !scopes.includes(record.scope) || !Number.isSafeInteger(record.size) || record.size < 5 || !Array.isArray(record.chunks) || record.chunks.length !== Math.ceil(record.size / CHUNK_SIZE)) throw new Error('Invalid archive record')
    record.chunks.forEach((chunk, index) => {
      if (!/^[a-f0-9]{64}$/u.test(chunk.sha256) || chunk.hash !== chunk.sha256.slice(0, 32) || chunk.size !== Math.min(CHUNK_SIZE, record.size - index * CHUNK_SIZE)) throw new Error('Invalid archive chunk')
      const name = assetPath(chunk.hash)
      if (manifest[name] && (manifest[name].size !== chunk.size || manifest[name].sha256 !== chunk.sha256)) throw new Error('Asset hash collision')
      manifest[name] = { hash: chunk.hash, size: chunk.size, sha256: chunk.sha256 }
    })
  }
  if (Object.keys(manifest).length > MAX_ASSETS) throw new Error('Archive capacity reached (20,000 assets); R2 originals retained. Provision another archive before continuing.')
  return manifest
}

/** Injectable adapters let failure tests exercise the same transaction used in production. */
export async function archiveFiles({ bridge, publisher, cache, maxFiles = 100, maxBytes = 8 * 1024 ** 3, log = console.log }) {
  await publisher.checkLifecycles()
  const lease = await bridge.acquire()
  try {
    const records = await bridge.records()
    buildManifest(records) // Fail closed on damaged/incomplete durable inventory.
    const selected = []
    let totalBytes = 0
    for (const scope of scopes) {
      for await (const object of bridge.candidates(scope)) {
        if (selected.length >= maxFiles || totalBytes + object.size > maxBytes) continue
        let record = records.find(r => r.scope === scope && r.key === object.key)
        if (record && (record.etag !== object.etag || record.size !== object.size)) throw new Error('Archived source changed; refusing to overwrite durable data')
        if (!record) {
          record = { v: 1, scope, ...object, chunks: [] }
          // Admission before any download or staging. Every file is published atomically.
          if (Object.keys(buildManifest(records)).length + Math.ceil(object.size / CHUNK_SIZE) > MAX_ASSETS) throw new Error('Archive capacity reached; R2 originals retained')
          for (let offset = 0; offset < object.size; offset += CHUNK_SIZE) {
            const size = Math.min(CHUNK_SIZE, object.size - offset)
            const bytes = await bridge.source(scope, object, offset, size)
            if (bytes.length !== size) throw new Error('Truncated source; R2 original retained')
            const sha256 = hashBytes(bytes)
            const chunk = { hash: sha256.slice(0, 32), sha256, size }
            await cache.put(chunk.hash, bytes)
            record.chunks.push(chunk)
          }
          buildManifest([...records, record])
          await bridge.stage(record)
          records.push(record)
        }
        selected.push(record)
        totalBytes += object.size
      }
    }
    if (!selected.length) { log('No files eligible for archival'); return { archived: 0, bytes: 0 } }
    const manifest = buildManifest(records)
    const hotChunks = new Map()
    for (const record of selected) record.chunks.forEach((chunk, index) => hotChunks.set(chunk.hash, { record, offset: index * CHUNK_SIZE, size: chunk.size }))
    await publisher.publish(manifest, async hash => {
      const entry = manifest[assetPath(hash)]
      if (!entry) throw new Error('Upload API requested an unknown asset')
      let bytes = await cache.get(hash)
      if (!bytes) {
        const hot = hotChunks.get(hash)
        if (hot) bytes = await bridge.source(hot.record.scope, hot.record, hot.offset, hot.size)
        else {
          try { bytes = await bridge.chunk(hash) } catch {
            // A previous run may have staged files beyond this run's batch limit.
            const record = records.find(r => r.chunks.some(c => c.hash === hash))
            const index = record.chunks.findIndex(c => c.hash === hash)
            bytes = await bridge.source(record.scope, record, index * CHUNK_SIZE, entry.size)
          }
        }
      }
      if (bytes.length !== entry.size || hashBytes(bytes) !== entry.sha256) throw new Error('Asset upload checksum mismatch')
      return bytes
    })
    // Read through the exact service binding used by conversion downloads, then hash on the runner.
    // Nothing is removed from R2 until every selected document has passed every chunk check.
    const verified = new Set()
    for (const record of selected) {
      for (const chunk of record.chunks) {
        if (verified.has(chunk.hash)) continue
        const bytes = await bridge.chunk(chunk.hash)
        if (bytes.length !== chunk.size || hashBytes(bytes) !== chunk.sha256) throw new Error('Published asset verification failed; R2 originals retained')
        verified.add(chunk.hash)
      }
    }
    for (const record of selected) await bridge.commit(record)
    log(JSON.stringify({ event: 'pdf_archive_completed', files: selected.length, bytes: totalBytes, assets: Object.keys(manifest).length }))
    return { archived: selected.length, bytes: totalBytes }
  } finally {
    try { await bridge.release(lease) } catch { log(JSON.stringify({ event: 'pdf_archive_lease_release_failed', expiresAt: lease.expiresAt })) }
  }
}

async function checked(response, operation) {
  if (!response.ok) { await response.body?.cancel(); throw new Error(`${operation}: HTTP ${response.status}`) }
  return response
}

export function createBridge({ baseUrl, secret, fetcher = fetch, signal = AbortSignal.timeout(50 * 60 * 1000) }) {
  let token
  const base = new URL('/api/internal/pdf-archive/', baseUrl)
  if (base.protocol !== 'https:') throw new Error('Archive bridge requires HTTPS')
  const call = async (action, { scope, key, cursor, pending, hash, method = 'GET', body, headers = {} } = {}) => {
    const url = new URL(action, base)
    for (const [name, value] of Object.entries({ scope, key, cursor, pending, hash })) if (value !== undefined) url.searchParams.set(name, String(value))
    return checked(await fetcher(url, { method, headers: { Authorization: `Bearer ${secret}`, ...(token ? { 'X-Archive-Lease': token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) }), `Archive ${action}`)
  }
  const pages = async function* (action, options) {
    let cursor = ''
    do {
      const page = await (await call(action, { ...options, cursor })).json()
      if (!Array.isArray(page.items) || typeof page.cursor !== 'string' || (cursor && cursor === page.cursor)) throw new Error('Invalid archive pagination')
      yield* page.items
      cursor = page.cursor
    } while (cursor)
  }
  return {
    async acquire() { const lease = await (await call('lease', { method: 'POST' })).json(); token = lease.token; return lease },
    async release() { await call('lease', { method: 'DELETE' }) },
    async records() {
      const records = new Map()
      for (const scope of scopes) for (const pending of [false, true]) {
        for await (const record of pages('records', { scope, pending })) {
          const id = `${scope}/${record.key}`
          const previous = records.get(id)
          if (previous && JSON.stringify(previous) !== JSON.stringify(record)) throw new Error('Conflicting staged and committed archive records')
          records.set(id, record)
        }
      }
      return [...records.values()]
    },
    candidates: scope => pages('candidates', { scope }),
    async source(scope, object, offset, size) {
      const response = await call('source', { scope, key: object.key, headers: { Range: `bytes=${offset}-${offset + size - 1}`, 'If-Match': object.httpEtag } })
      if (response.headers.get('etag') !== object.httpEtag || Number(response.headers.get('content-length')) !== size) throw new Error('Source identity changed')
      return Buffer.from(await response.arrayBuffer())
    },
    async chunk(hash) { return Buffer.from(await (await call('chunk', { hash })).arrayBuffer()) },
    async stage(record) { await call('stage', { scope: record.scope, key: record.key, method: 'POST', body: record }) },
    async commit(record) { await call('commit', { scope: record.scope, key: record.key, method: 'POST' }) },
  }
}

export function createPublisher({ accountId, apiToken, workerName = 'anyworkflow-pdf-archive', fetcher = fetch, signal = AbortSignal.timeout(50 * 60 * 1000) }) {
  if (!/^[a-f0-9]{32}$/u.test(accountId) || !/^[a-z0-9-]+$/u.test(workerName)) throw new Error('Invalid Cloudflare account or archive Worker')
  const root = `https://api.cloudflare.com/client/v4/accounts/${accountId}`
  const script = `/workers/scripts/${workerName}`
  const api = async (suffix, { method = 'GET', body, token = apiToken } = {}) => {
    const response = await checked(await fetcher(root + suffix, { method, headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) }), 'Cloudflare API')
    const envelope = await response.json()
    if (envelope.success !== true) throw new Error('Cloudflare API rejected archive operation')
    return envelope.result
  }
  const deploy = async (jwt, bootstrap = false) => {
    const form = new FormData()
    form.set('metadata', new Blob([JSON.stringify({ main_module: 'index.js', compatibility_date: '2026-10-28', bindings: [{ type: 'assets', name: 'ASSETS' }], ...(jwt ? { assets: { jwt, config: { html_handling: 'none', not_found_handling: 'none', run_worker_first: true } } } : {}), observability: { enabled: true, traces: { enabled: true, head_sampling_rate: 0.01 } } })], { type: 'application/json' }))
    form.set('index.js', new Blob([await readFile(new URL('../archive-worker/index.js', import.meta.url))], { type: 'application/javascript+module' }), 'index.js')
    // Bootstrap uses no assets binding until the first manifest exists.
    if (bootstrap) form.set('metadata', new Blob([JSON.stringify({ main_module: 'index.js', compatibility_date: '2026-10-28', observability: { enabled: true, traces: { enabled: true } } })], { type: 'application/json' }))
    await api(script, { method: 'PUT', body: form })
    // Explicitly disable both public endpoints; PDFs are accessible only through the gateway.
    await api(script + '/subdomain', { method: 'POST', body: { enabled: false, previews_enabled: false } })
  }
  return {
    async bootstrap() {
      const response = await fetcher(root + script + '/settings', { headers: { Authorization: `Bearer ${apiToken}` }, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
      if (response.status === 404) await deploy(undefined, true)
      else await checked(response, 'Inspect archive Worker')
    },
    async checkLifecycles() {
      for (const bucket of ['anyworkflow-library', 'anyworkflow-ocr-relay']) {
        const result = await api(`/r2/buckets/${bucket}/lifecycle`)
        if (!result || typeof result !== 'object') throw new Error('Cannot verify R2 lifecycle rules')
        // Cloudflare documents rules as optional when the bucket has no lifecycle configuration.
        const rules = result.rules ?? []
        if (!Array.isArray(rules)) throw new Error('Cannot verify R2 lifecycle rules')
        if (rules.some(rule => rule.enabled && rule.deleteObjectsTransition)) throw new Error(`Remove automatic object expiry from ${bucket} before archiving; keep incomplete multipart cleanup. R2 originals must survive archive failures.`)
      }
    },
    async publish(manifest, load) {
      const assetManifest = Object.fromEntries(Object.entries(manifest).map(([name, entry]) => [name, { hash: entry.hash, size: entry.size }]))
      const session = await api(script + '/assets-upload-session', { method: 'POST', body: { manifest: assetManifest } })
      if (!session.jwt || !Array.isArray(session.buckets)) throw new Error('Invalid asset upload session')
      let completion = session.buckets.length ? undefined : session.jwt
      // Honor API bucket grouping, uploading each bucket as one multipart body on the runner.
      for (const bucket of session.buckets) {
        const form = new FormData()
        for (const hash of bucket) form.set(hash, new Blob([(await load(hash)).toString('base64')], { type: 'application/octet-stream' }), hash)
        const result = await api('/workers/assets/upload?base64=true', { method: 'POST', token: session.jwt, body: form })
        if (result.jwt) completion = result.jwt
      }
      if (!completion) throw new Error('Asset upload did not return a completion token')
      await deploy(completion)
    },
  }
}

export async function main() {
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken, PDF_ARCHIVE_GATEWAY: baseUrl, ARCHIVE_ADMIN_SECRET: secret } = process.env
  if (!accountId || !apiToken) throw new Error('Cloudflare deployment credentials are required')
  const publisher = createPublisher({ accountId, apiToken })
  if (process.argv.includes('--bootstrap')) { await publisher.bootstrap(); return }
  if (!baseUrl || !secret || secret.length < 32) throw new Error('Configure PDF_ARCHIVE_GATEWAY and ARCHIVE_ADMIN_SECRET before enabling archival')
  const directory = await mkdtemp(new URL('../.archive-work-', import.meta.url))
  const cache = {
    put: (hash, bytes) => writeFile(path.join(directory, hash), bytes),
    async get(hash) { try { return await readFile(path.join(directory, hash)) } catch (error) { if (error.code === 'ENOENT') return null; throw error } },
  }
  try { await archiveFiles({ bridge: createBridge({ baseUrl, secret }), publisher, cache }) }
  finally { await rm(directory, { recursive: true, force: true }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
