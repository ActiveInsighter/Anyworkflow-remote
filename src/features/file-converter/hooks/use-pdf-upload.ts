import { useEffect, useRef, useState } from 'react'
import { toErrorMessage } from '@/lib/api/errors'
import { uploadPdf, type UploadedPdf } from '@/lib/api/file-upload'

export function usePdfUpload() {
  const [uploaded, setUploaded] = useState<UploadedPdf | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)

  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])

  function cancel() {
    active.current?.abort()
    active.current = null
    setUploading(false)
    setProgress(0)
  }

  async function upload(file: File) {
    cancel()
    const controller = new AbortController()
    active.current = controller
    setUploaded(null)
    setFileName(file.name)
    setError('')
    setUploading(true)
    try {
      const result = await uploadPdf(file, {
        signal: controller.signal,
        onProgress: (value) => { if (active.current === controller) setProgress(value) },
      })
      if (active.current === controller) setUploaded(result)
    } catch (failure) {
      if (active.current === controller && !controller.signal.aborted) setError(toErrorMessage(failure, '上传失败，请重新选择文件'))
    } finally {
      if (active.current === controller) {
        active.current = null
        setUploading(false)
      }
    }
  }

  return { uploaded, uploading, progress, fileName, error, upload, cancel }
}

export type PdfUploadState = ReturnType<typeof usePdfUpload>
