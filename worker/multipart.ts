import { UploadError, jsonResponse, r2ErrorCode, storageFailure } from './errors.js'
import { FILE_LIFETIME_MS, MAX_PDF_SIZE, PART_SIZE, PDF_SIGNATURE, SESSION_LIFETIME_MS, contentLength, readJson, uploadedPdf, validateFileName } from './pdf.js'
import { storeValidatedStream } from './stream.js'
import { signTicket, ticketKey, verifyTicket } from './ticket.js'
import type { PdfStorageEnv } from './pdf.js'
import type { UploadTicket } from './ticket.js'
import { assertLibraryFileAvailable, registerLibraryFile } from './library.js'

export async function createMultipart(request: Request, env: PdfStorageEnv, owner: string, version: 1 | 2 = 1): Promise<Response> {
  const payload = await readJson(request)
  if (Object.keys(payload).length !== 2 || !('fileName' in payload) || !('size' in payload)) {
    throw new UploadError('文件信息无效，请重新选择 PDF', 400, 'INVALID_UPLOAD_REQUEST')
  }
  const fileName = validateFileName(payload.fileName)
  const size = payload.size
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < PDF_SIGNATURE.length) {
    throw new UploadError('文件大小无效，请重新选择 PDF', 400, 'INVALID_FILE_SIZE')
  }
  if (size > MAX_PDF_SIZE) throw new UploadError('PDF 不能超过 2 GiB', 413, 'FILE_TOO_LARGE')
  const secret = await ticketKey(env)
  const createdAt = Date.now()
  const key = `${crypto.randomUUID()}.pdf`
  const session = crypto.randomUUID()
  const expiresAt = version === 2 ? '' : new Date(createdAt + FILE_LIFETIME_MS).toISOString()
  let multipart: R2MultipartUpload
  try {
    multipart = await env.PDF_UPLOADS.createMultipartUpload(key, {
      httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-store' },
      // Public metadata must not contain account IDs, names or tokens.
      customMetadata: { expiresAt, uploadSession: session, ...(version === 2 ? { owner, fileName } : {}) },
    })
  } catch (error) {
    throw storageFailure(error)
  }
  const ticket = await signTicket({
    v: version, owner, key, size, fileName, uploadId: multipart.uploadId, session, createdAt,
    expiresAt: createdAt + SESSION_LIFETIME_MS, fileExpiresAt: expiresAt,
  }, secret)
  return jsonResponse({ uploadId: multipart.uploadId, ticket, partSize: PART_SIZE }, 201)
}

export async function uploadPart(request: Request, env: PdfStorageEnv, owner: string, uploadId: string, number: string, version: 1 | 2 = 1): Promise<Response> {
  const ticket = await verifyTicket(request, env, owner, uploadId, version)
  const count = Math.ceil(ticket.size / PART_SIZE)
  if (!/^[1-9]\d*$/u.test(number) || !Number.isSafeInteger(Number(number)) || Number(number) > count) {
    throw new UploadError('上传分片编号无效', 400, 'INVALID_PART_NUMBER')
  }
  const partNumber = Number(number)
  const expectedSize = Math.min(PART_SIZE, ticket.size - (partNumber - 1) * PART_SIZE)
  if (contentLength(request, PART_SIZE) !== expectedSize) {
    throw new UploadError('上传分片大小不匹配，请重试', 400, 'LENGTH_MISMATCH')
  }
  const multipart = env.PDF_UPLOADS.resumeMultipartUpload(ticket.key, ticket.uploadId)
  const part = await storeValidatedStream(request, expectedSize, PART_SIZE, partNumber === 1,
    stream => multipart.uploadPart(partNumber, stream))
  return jsonResponse({ partNumber: part.partNumber, etag: part.etag })
}

function completedParts(value: unknown, ticket: UploadTicket): R2UploadedPart[] {
  const count = Math.ceil(ticket.size / PART_SIZE)
  if (!Array.isArray(value) || value.length !== count) throw new UploadError('上传分片不完整，请重新上传', 400, 'INVALID_PARTS')
  return value.map((part: unknown, index) => {
    if (!part || typeof part !== 'object' || Object.keys(part).length !== 2 ||
      !('partNumber' in part) || part.partNumber !== index + 1 || !('etag' in part) ||
      typeof part.etag !== 'string' || !part.etag || part.etag.length > 256 || /[^\x21-\x7e]/u.test(part.etag)) {
      throw new UploadError('上传分片顺序或校验信息无效，请重新上传', 400, 'INVALID_PARTS')
    }
    return { partNumber: index + 1, etag: part.etag }
  })
}

/** Re-read the object; a client-supplied part manifest is not evidence. */
async function verifiedObject(env: PdfStorageEnv, ticket: UploadTicket): Promise<R2Object | null> {
  const object = await env.PDF_UPLOADS.head(ticket.key)
  if (!object) return null
  if (object.customMetadata?.uploadSession !== ticket.session || object.customMetadata?.expiresAt !== ticket.fileExpiresAt) {
    throw new UploadError('上传文件与当前凭据不匹配，请重新上传', 409, 'UPLOAD_SESSION_MISMATCH')
  }
  if (object.size !== ticket.size || object.httpMetadata?.contentType !== 'application/pdf') {
    await env.PDF_UPLOADS.delete(ticket.key)
    throw new UploadError('文件合并校验失败，请重新上传', 400, 'INVALID_COMPLETED_FILE')
  }
  const ranged = await env.PDF_UPLOADS.get(ticket.key, {
    range: { offset: 0, length: PDF_SIGNATURE.length },
    onlyIf: { etagMatches: object.etag },
  })
  if (!ranged || !('body' in ranged)) throw storageFailure()
  // Explicitly limited to five signature bytes by the R2 ranged read above.
  const signature = new Uint8Array(await ranged.arrayBuffer())
  if (signature.length !== PDF_SIGNATURE.length || signature.some((byte, index) => byte !== PDF_SIGNATURE[index])) {
    await env.PDF_UPLOADS.delete(ticket.key)
    throw new UploadError('文件内容不是有效的 PDF，请重新上传', 400, 'INVALID_COMPLETED_FILE')
  }
  return object
}

export async function completeMultipart(request: Request, env: PdfStorageEnv, owner: string, uploadId: string, version: 1 | 2 = 1): Promise<Response> {
  const ticket = await verifyTicket(request, env, owner, uploadId, version)
  if (version === 2) await assertLibraryFileAvailable(env.PDF_UPLOADS, ticket.key)
  const payload = await readJson(request)
  if (Object.keys(payload).length !== 1 || !('parts' in payload)) throw new UploadError('上传分片信息无效', 400, 'INVALID_PARTS')
  const parts = completedParts(payload.parts, ticket)
  try {
    // Repeating complete after a lost response returns the same public link.
    let object = await verifiedObject(env, ticket)
    if (!object) {
      const multipart = env.PDF_UPLOADS.resumeMultipartUpload(ticket.key, ticket.uploadId)
      try {
        await multipart.complete(parts)
      } catch (error) {
        // A concurrent complete or a lost R2 response may already have committed.
        object = await verifiedObject(env, ticket)
        if (!object) throw storageFailure(error)
      }
      object = object || await verifiedObject(env, ticket)
      if (!object) throw storageFailure()
    }
    if (version === 2) return jsonResponse(await registerLibraryFile(env, owner, object, ticket.fileName), 201)
    return uploadedPdf(env, ticket.key, ticket.fileName, object.size, ticket.fileExpiresAt)
  } catch (error) {
    if (error instanceof UploadError) throw error
    throw storageFailure(error)
  }
}

export async function abortMultipart(request: Request, env: PdfStorageEnv, owner: string, uploadId: string, version: 1 | 2 = 1): Promise<Response> {
  const ticket = await verifyTicket(request, env, owner, uploadId, version)
  try {
    // Only abort the pending session. If complete wins a concurrent race, its
    // committed PDF remains available; cancellation never deletes objects.
    await env.PDF_UPLOADS.resumeMultipartUpload(ticket.key, ticket.uploadId).abort()
  } catch (error) {
    if (r2ErrorCode(error) !== 10024) throw storageFailure(error)
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
