import { useRef, useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import {
  cancelPdfJob,
  createPdfJob,
  isPdfJobActive,
  listPdfJobs,
  newRecordId,
  pdfBrowserDownloadUrl,
  rerunPdfJob,
  type PdfJob,
  type PdfJobInput,
} from '@/lib/api/file-conversion'
import { startBrowserDownload } from '@/lib/platform/download'
import { wakeConverter } from '@/lib/api/converter-dispatcher'
import { notifyTasksChanged } from '@/lib/tasks'

/** Follow active conversions closely; an idle history only needs an occasional refresh. */
const ACTIVE_POLL_MS = 5_000
const IDLE_POLL_MS = 30_000

/**
 * Paged conversion history plus every job write. Creates reuse the same record id until the
 * payload changes, so retrying after a lost response can never start a second paid job.
 */
export function useConversionJobs() {
  const [page, setPage] = useState(1)
  const jobs = useAsyncData((signal) => listPdfJobs(page, signal), [page], {
    pollMs: (data) => (data?.items.some(isPdfJobActive) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  // Separate trackers: a create failure belongs to the form, a row failure to the list.
  const creating = useAsyncAction()
  const action = useAsyncAction()
  const submission = useRef<{ id: string; payload: string } | null>(null)
  const rerunSubmission = useRef<{ parentId: string; id: string } | null>(null)

  /** New work lands on page 1; jump there, or reload when already on it. */
  async function showLatest() {
    if (page !== 1) setPage(1)
    else await jobs.reload()
  }

  async function create(input: PdfJobInput, configRevision: number): Promise<boolean> {
    if (creating.busy) return false
    const payload = JSON.stringify({ ...input, configRevision })
    if (submission.current?.payload !== payload) submission.current = { id: newRecordId(), payload }
    const { id } = submission.current
    const done = await creating.run(
      'create',
      async () => {
        await createPdfJob(id, input)
        wakeConverter()
        notifyTasksChanged()
        submission.current = null
        await showLatest()
        return true
      },
      { success: '任务已提交，状态会自动更新', failure: false },
    )
    return Boolean(done)
  }

  function cancel(job: PdfJob) {
    void action.run(
      `${job.id}:cancel`,
      async () => {
        await cancelPdfJob(job)
        wakeConverter()
        notifyTasksChanged()
        await jobs.reload()
      },
      { success: `已请求结束「${job.title}」`, failure: false },
    )
  }

  function rerun(job: PdfJob) {
    if (rerunSubmission.current?.parentId !== job.id) rerunSubmission.current = { parentId: job.id, id: newRecordId() }
    const { id } = rerunSubmission.current
    void action.run(
      `${job.id}:rerun`,
      async () => {
        await rerunPdfJob(id, job)
        wakeConverter()
        notifyTasksChanged()
        rerunSubmission.current = null
        await showLatest()
      },
      { success: `已重跑「${job.title}」，沿用原任务的转换参数`, failure: false },
    )
  }

  function download(job: PdfJob) {
    void action.run(
      `${job.id}:download`,
      async () => {
        startBrowserDownload(await pdfBrowserDownloadUrl(job), `${job.outputName}.zip`)
      },
      { failure: false, success: '已交给浏览器下载，可在下载列表查看进度' },
    )
  }

  return {
    jobs,
    page,
    setPage,
    creating: creating.busy,
    createError: creating.error,
    clearCreateError: creating.clearError,
    pending: action.pending,
    busy: action.busy,
    error: action.error,
    create,
    cancel,
    rerun,
    download,
  }
}

export type ConversionJobsState = ReturnType<typeof useConversionJobs>
