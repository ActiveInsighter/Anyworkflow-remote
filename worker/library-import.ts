import { UploadError, jsonResponse } from './errors.js'
import { libraryEnv, registerLibraryFile } from './library.js'

/** Import only surviving legacy uploads referenced by this account's saved jobs. */
export async function importLegacyFiles(request: Request, env: Env, owner: string): Promise<Response> {
  const marker = `imports/${encodeURIComponent(owner)}`
  const previous = await env.LIBRARY_FILES.get(marker)
  const progress = previous ? await previous.json<{ page: number; done: boolean; imported: number; unavailable: number }>() : { page: 1, done: false, imported: 0, unavailable: 0 }
  if (progress.done) return jsonResponse(progress)
  const url = new URL('/api/collections/aw_pdf_to_md_jobs/records', env.POCKETBASE_URL)
  url.searchParams.set('filter', `owner = "${owner.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`)
  url.searchParams.set('page', String(progress.page))
  url.searchParams.set('perPage', '100')
  url.searchParams.set('sort', 'created,id')
  url.searchParams.set('fields', 'id,owner,title,sourceUrl')
  const response = await fetch(url, { headers: { Authorization: request.headers.get('Authorization')!.replace(/^Bearer /iu, '') }, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new UploadError('导入历史上传失败，请刷新重试', 502, 'IMPORT_UNAVAILABLE')
  const payload = await response.json<{ items: { owner: string; title: string; sourceUrl: string }[]; totalPages: number }>()
  if (!Array.isArray(payload.items) || payload.items.some(job => job.owner !== owner)) throw new UploadError('历史文件归属验证失败', 502, 'INVALID_IMPORT_RESPONSE')
  for (const job of payload.items) {
    let source: URL
    try { source = new URL(job.sourceUrl) } catch { continue }
    if (source.origin !== new URL(env.PDF_PUBLIC_BASE_URL).origin || !/^\/[a-f0-9-]{36}\.pdf$/u.test(source.pathname) || source.search || source.hash) continue
    const oldKey = source.pathname.slice(1)
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${owner}:${oldKey}`))).slice(0, 16)
    bytes[6] = (bytes[6] & 15) | 64
    bytes[8] = (bytes[8] & 63) | 128
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.pdf`
    if (await env.LIBRARY_FILES.head(`deleted/${key}`) || await env.LIBRARY_FILES.head(`owners/${encodeURIComponent(owner)}/${key}`)) continue
    let object = await env.LIBRARY_FILES.head(key)
    const fileName = `${String(job.title || '历史上传').replace(/[/\\\x00-\x1f\x7f]/gu, '_').replace(/\.pdf$/iu, '').slice(0, 240)}.pdf`
    if (!object) {
      const legacy = await env.PDF_UPLOADS.get(oldKey)
      if (!legacy) { progress.unavailable++; continue }
      object = await env.LIBRARY_FILES.put(key, legacy.body, { httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-store' }, customMetadata: { owner, fileName } })
      if (!object) throw new UploadError('保存历史上传失败，请刷新重试', 502, 'IMPORT_UNAVAILABLE')
    }
    await registerLibraryFile(libraryEnv(request, env), owner, object, fileName)
    progress.imported++
  }
  progress.done = progress.page >= payload.totalPages
  progress.page++
  await env.LIBRARY_FILES.put(marker, JSON.stringify(progress))
  return jsonResponse(progress)
}
