import { useEffect, useRef, useState } from 'react'
import { toErrorMessage } from '@/lib/api/errors'
import { uploadPdf, type UploadedPdf } from '@/lib/api/file-upload'

export interface QueuedUpload {
  key: string
  name: string
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'canceled'
  error: string
}

type Job = { key: string; file: File; folder: string }

/**
 * Several PDFs uploaded one after another into the folder that was open when they were picked.
 * `onUploaded` files each one (e.g. moves it into that folder) before the next starts.
 */
export function useUploadQueue(onUploaded: (file: UploadedPdf, folder: string) => Promise<void>) {
  const [items, setItems] = useState<QueuedUpload[]>([])
  const jobs = useRef<Job[]>([])
  const running = useRef(false)
  const active = useRef<{ key: string; controller: AbortController } | null>(null)
  const callback = useRef(onUploaded)
  useEffect(() => {
    callback.current = onUploaded
  })
  useEffect(
    () => () => {
      jobs.current = []
      active.current?.controller.abort()
    },
    [],
  )

  const patch = (key: string, next: Partial<QueuedUpload>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)))

  async function drain() {
    if (running.current) return
    running.current = true
    try {
      for (let job = jobs.current.shift(); job; job = jobs.current.shift()) {
        const controller = new AbortController()
        active.current = { key: job.key, controller }
        patch(job.key, { status: 'uploading' })
        try {
          const key = job.key
          const uploaded = await uploadPdf(job.file, {
            signal: controller.signal,
            onProgress: (progress) => patch(key, { progress }),
          })
          await callback.current(uploaded, job.folder)
          patch(job.key, { status: 'done', progress: 100 })
        } catch (cause) {
          if (controller.signal.aborted) patch(job.key, { status: 'canceled' })
          else patch(job.key, { status: 'failed', error: toErrorMessage(cause, '上传失败') })
        }
      }
    } finally {
      active.current = null
      running.current = false
    }
  }

  function add(files: readonly File[], folder: string) {
    const added = files.map((file) => ({ key: crypto.randomUUID(), file, folder }))
    if (!added.length) return
    jobs.current.push(...added)
    setItems((current) => [
      ...current.filter((item) => item.status === 'uploading' || item.status === 'queued'),
      ...added.map((job) => ({ key: job.key, name: job.file.name, progress: 0, status: 'queued' as const, error: '' })),
    ])
    void drain()
  }

  /** Stop the running upload and drop the queued ones. */
  function cancelAll() {
    for (const job of jobs.current) patch(job.key, { status: 'canceled' })
    jobs.current = []
    active.current?.controller.abort()
  }

  /** Hide the finished list; only allowed once nothing is in flight. */
  function dismiss() {
    setItems((current) => current.filter((item) => item.status === 'uploading' || item.status === 'queued'))
  }

  return { items, add, cancelAll, dismiss }
}

export type UploadQueue = ReturnType<typeof useUploadQueue>
