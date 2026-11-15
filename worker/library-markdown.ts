import { UploadError, jsonResponse } from './errors.js'
import { cleanName } from './library-folders.js'
import { assertLibraryFileAvailable, libraryEnv, registerLibraryFile } from './library.js'

const MAX_BYTES = 2 * 1024 * 1024
const MD_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.md$/u

export async function uploadMarkdown(request: Request, env: Env, owner: string): Promise<Response> {
  let name: string
  try { name = cleanName(decodeURIComponent(request.headers.get('X-File-Name') || ''), 240, '文件名') }
  catch { throw new UploadError('Markdown 文件名无效', 400, 'INVALID_NAME') }
  if (!/\.md$/iu.test(name)) throw new UploadError('只支持 .md 文件', 400, 'INVALID_EXTENSION')
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) throw new UploadError('Markdown 最大支持 2 MiB', 413, 'BODY_TOO_LARGE')
  const reader = request.body?.getReader()
  if (!reader) throw new UploadError('文件内容为空', 400, 'EMPTY_FILE')
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
  let content = '', size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) { await reader.cancel(); throw new UploadError('Markdown 最大支持 2 MiB', 413, 'BODY_TOO_LARGE') }
      content += decoder.decode(value, { stream: true })
    }
    content += decoder.decode()
  } catch (error) {
    if (error instanceof UploadError) throw error
    throw new UploadError('请上传 UTF-8 编码的 Markdown 文件', 400, 'INVALID_ENCODING')
  } finally { reader.releaseLock() }
  if (!content.trim() || content.includes('\0')) throw new UploadError('文件内容为空或不是有效文本', 400, 'INVALID_MARKDOWN')
  const key = `${crypto.randomUUID()}.md`
  try {
    const object = await env.LIBRARY_FILES.put(key, content, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: 'no-store' },
      customMetadata: { owner, fileName: name },
    })
    if (!object) throw new Error('Missing object')
    return jsonResponse(await registerLibraryFile(libraryEnv(request, env), owner, object, name), 201)
  } catch (error) {
    await env.LIBRARY_FILES.delete([key, `owners/${encodeURIComponent(owner)}/${key}`]).catch(() => undefined)
    throw error
  }
}

export async function readMarkdown(env: Env, owner: string, id: string): Promise<Response> {
  if (!MD_ID.test(id)) throw new UploadError('只支持 Markdown 文件', 400, 'INVALID_EXTENSION')
  const object = await env.LIBRARY_FILES.get(id)
  if (!object || object.customMetadata?.owner !== owner) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
  await assertLibraryFileAvailable(env.LIBRARY_FILES, id)
  if (object.size > MAX_BYTES) throw new UploadError('Markdown 最大支持 2 MiB', 413, 'BODY_TOO_LARGE')
  return jsonResponse({ id, content: await object.text() })
}
