import { CircleStop, ExternalLink, FileText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { JobMenu, JobNote, JobRow } from '@/features/tasks'
import { formatDateTime } from '@/lib/format'
import { hasCaptureResult, isCaptureJobActive, isCaptureJobFinished } from '@/lib/api/page-capture'
import { pageCaptureKind } from '@/lib/tasks'
import type { CaptureJob } from '@/types/page-capture'
import { extractorLabel, jobTitle, safeHref } from '../lib/capture-display'

function retrying(job: CaptureJob): boolean {
  return job.status === 'queued' && job.attempts > 0
}

/** One capture: where it stands, what it found, and the action its state puts first. */
export function CaptureJobItem({
  job,
  pending,
  busy,
  onOpen,
  onCancel,
  onRerun,
  onDelete,
}: {
  job: CaptureJob
  /** Key of the running row action, `${jobId}:${action}`. */
  pending: string | null
  busy: boolean
  onOpen: () => void
  onCancel: () => void
  onRerun: () => void
  onDelete: () => void
}) {
  const is = (action: string) => pending === `${job.id}:${action}`
  const stopping = job.cancelRequested || is('cancel')
  const href = safeHref(job.url)
  const title = jobTitle(job)
  const hasResult = hasCaptureResult(job)
  const finished = isCaptureJobFinished(job)

  return (
    <JobRow
      kind={pageCaptureKind}
      record={job}
      title={title}
      onOpen={hasResult ? onOpen : undefined}
      meta={[
        job.host,
        formatDateTime(job.created),
        job.wordCount > 0 ? `${job.wordCount.toLocaleString('zh-CN')} 字` : '',
        job.extractor ? extractorLabel(job.extractor) : '',
      ]}
      action={
        hasResult ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onOpen}>
            <FileText data-icon="inline-start" />
            查看内容
          </Button>
        ) : isCaptureJobActive(job) ? (
          <Button size="sm" variant="secondary" disabled={busy || job.cancelRequested} onClick={onCancel}>
            {is('cancel') ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
            {stopping ? '结束中…' : '结束任务'}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onRerun}>
            {is('rerun') ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
            {is('rerun') ? '提交中…' : '重新采集'}
          </Button>
        )
      }
      menu={
        href || finished ? (
          <JobMenu label={`更多操作 ${title}`}>
            {href ? (
              <DropdownMenuItem asChild>
                <a href={href} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  打开原页面
                </a>
              </DropdownMenuItem>
            ) : null}
            {hasResult ? (
              <DropdownMenuItem disabled={busy} onSelect={onRerun}>
                <RotateCcw />
                重新采集
              </DropdownMenuItem>
            ) : null}
            {finished ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={busy} onSelect={onDelete}>
                  <Trash2 />
                  删除记录
                </DropdownMenuItem>
              </>
            ) : null}
          </JobMenu>
        ) : null
      }
    >
      {job.error ? (
        <JobNote tone={retrying(job) ? 'warning' : 'danger'}>
          {retrying(job) ? `第 ${job.attempts} 次未成功，稍后自动重试：` : ''}
          {job.error}
        </JobNote>
      ) : null}
    </JobRow>
  )
}
