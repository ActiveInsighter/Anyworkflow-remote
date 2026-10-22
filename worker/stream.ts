import { UploadError, storageFailure } from './errors.js'
import { PDF_SIGNATURE } from './pdf.js'

/** Validate bytes incrementally, preserving the known length required by R2. */
export async function storeValidatedStream<T>(
  request: Request,
  size: number,
  maxSize: number,
  checkPdf: boolean,
  store: (stream: ReadableStream<Uint8Array>) => Promise<T>,
): Promise<T> {
  if (!request.body) throw new UploadError('文件内容为空', 400, 'INVALID_PDF')
  let received = 0
  let validationError: UploadError | undefined
  function reject(message: string, status: number, code: string): never {
    validationError = new UploadError(message, status, code)
    throw validationError
  }
  const validator = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const offset = received
      received += chunk.byteLength
      if (received > maxSize) reject('上传内容超过大小限制', 413, 'FILE_TOO_LARGE')
      if (received > size) reject('文件大小与上传内容不一致，请重试', 400, 'LENGTH_MISMATCH')
      if (checkPdf) {
        for (let index = offset; index < Math.min(received, PDF_SIGNATURE.length); index += 1) {
          if (chunk[index - offset] !== PDF_SIGNATURE[index]) reject('文件内容不是有效的 PDF', 400, 'INVALID_PDF')
        }
      }
      controller.enqueue(chunk)
    },
    flush() {
      if (received !== size) reject('文件上传不完整，请重试', 400, 'LENGTH_MISMATCH')
      if (checkPdf && received < PDF_SIGNATURE.length) reject('文件内容不是有效的 PDF', 400, 'INVALID_PDF')
    },
  })
  const fixed = new FixedLengthStream(size)
  const transfer = new AbortController()
  // R2 can reject before consuming anything; unblock a backpressured pump.
  const storage = Promise.resolve().then(() => store(fixed.readable)).catch(error => {
    transfer.abort()
    throw error
  })
  const [pumpResult, storageResult] = await Promise.allSettled([
    request.body.pipeThrough(validator).pipeTo(fixed.writable, { signal: transfer.signal }),
    storage,
  ])
  if (pumpResult.status === 'rejected' || storageResult.status === 'rejected') {
    if (validationError) throw validationError
    if (request.signal.aborted) throw new UploadError('文件上传已中断，请重试', 400, 'UPLOAD_INTERRUPTED')
    throw storageFailure(storageResult.status === 'rejected' ? storageResult.reason : undefined)
  }
  return storageResult.value
}
