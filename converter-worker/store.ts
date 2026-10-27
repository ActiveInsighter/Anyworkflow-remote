import { readJson } from './http.js'
import type { ConversionJob, JobPatch, Store, Archive } from './types.js'

const collection = '/api/collections/aw_pdf_to_md_jobs/records'

// Stream multipart data, enforcing the signed blob's length and ZIP signature.
// FormData+Blob would buffer up to 100 MiB and exceed the isolate memory budget.
export function archiveMultipart(archive: Archive, filename: string, metadata: JobPatch | Record<string, string | number>) {
  const boundary = `aw-${crypto.randomUUID()}`
  const encoder = new TextEncoder()
  const safeName = filename.replace(/[\r\n"\\]/gu, '_')
  const fields = { ...metadata, fileSize: archive.size }
  const prefix = encoder.encode(Object.entries(fields).map(([key, value]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`,
  ).join('') + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/zip\r\n\r\n`)
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`)
  const reader = archive.response.body!.getReader()
  const signature = [80, 75, 3, 4]
  let size = 0, phase = 0
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (phase === 0) { phase = 1; controller.enqueue(prefix); return }
      try {
        const { done, value } = await reader.read()
        if (done) {
          if (size !== archive.size) throw new Error('Artifact length mismatch')
          controller.enqueue(suffix)
          controller.close()
          reader.releaseLock()
          return
        }
        for (let i = 0; i < value.byteLength && size + i < 4; i++) {
          if (value[i] !== signature[size + i]) throw new Error('Invalid ZIP signature')
        }
        size += value.byteLength
        if (size > archive.size) throw new Error('Artifact exceeds declared length')
        controller.enqueue(value)
      } catch (error) {
        await reader.cancel().catch(() => undefined)
        controller.error(error)
      }
    },
    cancel(reason) { return reader.cancel(reason) },
  })
  return { stream, contentType: `multipart/form-data; boundary=${boundary}` }
}

export function createStore(env: ConverterEnv, fetchImpl: typeof fetch = fetch): Store {
  const root = new URL(env.POCKETBASE_URL).origin
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${env.POCKETBASE_SERVER_TOKEN}`)
    headers.set('Accept', 'application/json')
    return readJson<T>(await fetchImpl(`${root}${collection}${path}`, {
      ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(init.body instanceof ReadableStream ? 120_000 : 30_000),
    }))
  }
  const idPath = (id: string) => {
    if (!/^[a-z0-9]{15}$/u.test(id)) throw new Error('Invalid PocketBase job id')
    return `/${id}`
  }
  return {
    // Oldest last-check first: bounded, fair sweeps without pagination drift.
    async list(statuses) {
      if (statuses.length === 0) return []
      const query = new URLSearchParams({ filter: statuses.map(status => `status="${status}"`).join(' || '), sort: 'updated,id', perPage: '10' })
      const result = await request<{ items: ConversionJob[] }>(`?${query}`)
      if (!Array.isArray(result.items)) throw new Error('Invalid job list')
      return result.items
    },
    get: id => request<ConversionJob>(idPath(id)),
    patch: (id, data) => request(idPath(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    async upload(id, archive, filename, metadata) {
      const { stream, contentType } = archiveMultipart(archive, filename, metadata)
      return request(idPath(id), { method: 'PATCH', headers: { 'Content-Type': contentType }, body: stream })
    },
  }
}
