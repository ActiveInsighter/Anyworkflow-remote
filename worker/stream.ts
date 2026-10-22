import { UploadError, storageFailure } from './errors.js'
import { PDF_SIGNATURE } from './pdf.js'

/** Read only the first bytes of a stream branch and check the PDF signature. */
async function checkSignature(probe: ReadableStream<Uint8Array>): Promise<void> {
  const reader = probe.getReader()
  const head = new Uint8Array(PDF_SIGNATURE.length)
  let filled = 0
  try {
    while (filled < head.length) {
      const { done, value } = await reader.read()
      if (done) break
      const take = Math.min(value.byteLength, head.length - filled)
      head.set(value.subarray(0, take), filled)
      filled += take
    }
  } finally {
    // Cancelling this branch leaves the other one flowing without buffering.
    await reader.cancel().catch(() => {})
  }
  if (filled < head.length || head.some((byte, index) => byte !== PDF_SIGNATURE[index])) {
    throw new UploadError('文件内容不是有效的 PDF', 400, 'INVALID_PDF')
  }
}

/**
 * Store a request body of a known length. The body is piped natively into
 * FixedLengthStream, which enforces the length itself; no per-chunk JavaScript
 * runs. A JS TransformStream over a 32 MiB part costs ~1 s of CPU, and
 * concurrent parts then exceed the Worker CPU limit (503). The PDF signature is
 * read from a tee branch that is cancelled after the first bytes.
 */
export async function storeValidatedStream<T>(
  request: Request,
  size: number,
  maxSize: number,
  checkPdf: boolean,
  store: (stream: ReadableStream<Uint8Array>) => Promise<T>,
): Promise<T> {
  if (!request.body) throw new UploadError('文件内容为空', 400, 'INVALID_PDF')
  if (size > maxSize) throw new UploadError('上传内容超过大小限制', 413, 'FILE_TOO_LARGE')
  let source = request.body
  let signature: Promise<void> | undefined
  if (checkPdf) {
    const [body, probe] = source.tee()
    source = body
    signature = checkSignature(probe)
  }
  let validationError: UploadError | undefined
  const fixed = new FixedLengthStream(size)
  const transfer = new AbortController()
  // Settle the signature check first; an invalid file stops the transfer.
  const checked = signature?.catch(error => {
    if (error instanceof UploadError) validationError = error
    transfer.abort()
  })
  // R2 can reject before consuming anything; unblock a backpressured pump.
  const storage = Promise.resolve().then(() => store(fixed.readable)).catch(error => {
    transfer.abort()
    throw error
  })
  const [pumpResult, storageResult] = await Promise.allSettled([
    source.pipeTo(fixed.writable, { signal: transfer.signal }),
    storage,
    checked,
  ])
  if (pumpResult.status === 'rejected' || storageResult.status === 'rejected') {
    if (validationError) throw validationError
    if (request.signal.aborted) throw new UploadError('文件上传已中断，请重试', 400, 'UPLOAD_INTERRUPTED')
    // FixedLengthStream rejects a body that is shorter or longer than declared.
    const reasons = [pumpResult, storageResult].flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (reasons.some(reason => reason instanceof TypeError && /FixedLengthStream/u.test(reason.message))) {
      throw new UploadError('文件大小与上传内容不一致，请重试', 400, 'LENGTH_MISMATCH')
    }
    throw storageFailure(storageResult.status === 'rejected' ? storageResult.reason : undefined)
  }
  return storageResult.value
}
