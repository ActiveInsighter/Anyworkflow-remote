import { CircleStop, Download, ExternalLink, FileSearch, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { JobMenu, JobNote, JobRow } from '@/features/tasks'
import { isPdfJobActive, isPdfJobTerminal, type PdfJob } from '@/lib/api/file-conversion'
import { fileConversionKind } from '@/lib/tasks'
import { formatDateTime, formatFileSize } from '@/lib/format'
import { jobDuration, jobPageRange, jobRunUrl } from '../lib/job-status'

/** One conversion: its state, its artifact, and the action that state puts first. */
export function ConversionJobItem({
  job,
  pending,
  busy,
  onOpen,
  onCancel,
  onRerun,
  onDownload,
}: {
  job: PdfJob
  /** Key of the running row action, `${jobId}:${action}`. */
  pending: string | null
  busy: boolean
  onOpen: () => void
  onCancel: () => void
  onRerun: () => void
  onDownload: () => void
}) {
  const runUrl = jobRunUrl(job)
  const is = (action: string) => pending === `${job.id}:${action}`
  const stopping = job.cancelRequested || is('cancel')
  const rerunnable = isPdfJobTerminal(job)

  const rerunButton = (
    <Button size="sm" variant="secondary" disabled={busy} onClick={onRerun}>
      {is('rerun') ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
      {is('rerun') ? '重跑中…' : '重跑'}
    </Button>
  )

  return (
    <JobRow
      kind={fileConversionKind}
      record={job}
      title={job.title}
      onOpen={onOpen}
      meta={[
        formatDateTime(job.created),
        jobDuration(job),
        job.fileSize > 0 ? formatFileSize(job.fileSize) : '',
        jobPageRange(job),
        job.options?.adjacent_pages ? '附带相邻页' : '',
      ]}
      action={
        job.file ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onDownload}>
            {is('download') ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
            {is('download') ? '准备下载…' : '下载 ZIP'}
          </Button>
        ) : isPdfJobActive(job) ? (
          <Button size="sm" variant="secondary" disabled={busy || job.cancelRequested} onClick={onCancel}>
            {is('cancel') ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
            {stopping ? '结束中…' : '结束任务'}
          </Button>
        ) : rerunnable ? rerunButton : null
      }
      menu={
        <JobMenu label={`更多操作 ${job.title}`}>
          <DropdownMenuItem onSelect={onOpen}>
            <FileSearch />
            查看详情
          </DropdownMenuItem>
          {job.file && rerunnable ? (
            <DropdownMenuItem disabled={busy} onSelect={onRerun}>
              <RotateCcw />
              重跑
            </DropdownMenuItem>
          ) : null}
          {runUrl ? (
            <DropdownMenuItem asChild>
              <a href={runUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                运行详情
              </a>
            </DropdownMenuItem>
          ) : null}
        </JobMenu>
      }
    >
      {job.error ? <JobNote>{job.error}</JobNote> : null}
    </JobRow>
  )
}
