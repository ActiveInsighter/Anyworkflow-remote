import { useEffect, useRef, useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { createRunExport, downloadRunExport, isRunExportActive, listRunExports } from '@/lib/api/run-exports'
import { saveBlob } from '@/lib/platform/download'
import type { RunExportContent, RunExportRecord } from '@/types/run-export'

export function useRunExports(runId: string, open: boolean) {
  const [page, setPage] = useState(1)
  const [contentMode, setContentMode] = useState<RunExportContent>('conversation')
  const jobs = useAsyncData(signal => listRunExports(runId, page, signal), [runId, page], { enabled: open, pollMs: 5_000 })
  const action = useAsyncAction()
  const submission = useRef<{ id: string; contentMode: RunExportContent } | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => { controller.current?.abort() }, [runId])

  function create() {
    if (submission.current?.contentMode !== contentMode) {
      submission.current = { id: crypto.randomUUID().replaceAll('-', '').slice(0, 15), contentMode }
    }
    const pending = submission.current
    void action.run('create', async () => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      await createRunExport(pending.id, runId, pending.contentMode, current.signal)
      submission.current = null
      if (page === 1) await jobs.reload()
      else setPage(1)
    }, { success: '导出已提交，完成后可下载 ZIP', failure: false })
  }

  function download(job: RunExportRecord) {
    void action.run(`download:${job.id}`, async () => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      const blob = await downloadRunExport(job, current.signal)
      current.signal.throwIfAborted()
      saveBlob(blob, job.file)
    }, { failure: false })
  }

  return { jobs, page, setPage, contentMode, setContentMode, action, create, download,
    active: jobs.data?.items.some(isRunExportActive) ?? false }
}
