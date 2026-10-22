import { UploadError, storageFailure } from './errors.js'
import { FILE_LIFETIME_MS, MAX_SINGLE_SIZE, PDF_SIGNATURE, contentLength, uploadFileName, uploadedPdf } from './pdf.js'
import { storeValidatedStream } from './stream.js'

export async function singleUpload(request: Request, env: Env): Promise<Response> {
  const fileName = uploadFileName(request)
  const size = contentLength(request, MAX_SINGLE_SIZE)
  if (size < PDF_SIGNATURE.length) throw new UploadError('文件内容不是有效的 PDF', 400, 'INVALID_PDF')
  const key = `${crypto.randomUUID()}.pdf`
  const expiresAt = new Date(Date.now() + FILE_LIFETIME_MS).toISOString()
  try {
    const object = await storeValidatedStream(request, size, MAX_SINGLE_SIZE, true, async stream => {
      const stored = await env.PDF_UPLOADS.put(key, stream, {
        httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-store' },
        customMetadata: { expiresAt },
      })
      if (!stored || stored.size !== size) throw storageFailure()
      return stored
    })
    return uploadedPdf(env, key, fileName, object.size, expiresAt)
  } catch (error) {
    try {
      await env.PDF_UPLOADS.delete(key)
    } catch {
      console.error(JSON.stringify({ event: 'pdf_upload_failed', code: 'CLEANUP_UNAVAILABLE' }))
    }
    throw error
  }
}
