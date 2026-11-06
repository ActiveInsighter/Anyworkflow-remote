import { CircleStop, ExternalLink, FileText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TaskProgress, TaskStatusBadge } from '@/features/tasks'
import { formatDateTime } from '@/lib/format'
import { hasCaptureResult, isCaptureJobActive, isCaptureJobFinished } from '@/lib/api/page-capture'
import { pageCaptureKind } from '@/lib/tasks'
import type { CaptureJob } from '@/types/page-capture'
import { extractorLabel, jobTitle, safeHref } from '../lib/capture-display'

function retryNote(job: CaptureJob): string {
  return job.status === 'queued' && job.attempts > 0 ? `第 ${job.attempts} 次未成功，稍后自动重试：` : ''
}

/** One capture: where it stands, what it found, and the actions its state allows. */
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
  const meta = [
    job.host,
    job.wordCount > 0 ? `${job.wordCount.toLocaleString('zh-CN')} 字` : '',
    job.extractor ? extractorLabel(job.extractor) : '',
    formatDateTime(job.created),
  ].filter(Boolean)

  return (
    <article className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-body font-medium break-all">{jobTitle(job)}</h3>
            <TaskStatusBadge kind={pageCaptureKind} record={job} className="shrink-0" />
          </div>
          <p className="mt-1 text-xs break-words text-muted-foreground tabular-nums">{meta.join(' · ')}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end sm:gap-2">
          {hasCaptureResult(job) ? (
            <Button size="sm" disabled={busy} onClick={onOpen}>
              <FileText data-icon="inline-start" />
              查看内容
            </Button>
          ) : null}
          {isCaptureJobActive(job) ? (
            <Button size="sm" variant="outline" disabled={busy || job.cancelRequested} onClick={onCancel}>
              {is('cancel') ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
              {stopping ? '结束中…' : '结束任务'}
            </Button>
          ) : null}
          {isCaptureJobFinished(job) ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={onRerun}>
              {is('rerun') ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
              {is('rerun') ? '提交中…' : '重新采集'}
            </Button>
          ) : null}
          {href ? (
            <Button size="icon-sm" variant="ghost" asChild>
              <a href={href} target="_blank" rel="noreferrer noopener" aria-label="打开原页面">
                <ExternalLink />
              </a>
            </Button>
          ) : null}
          {isCaptureJobFinished(job) ? (
            <Button size="icon-sm" variant="ghost" disabled={busy} onClick={onDelete} aria-label="删除记录">
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>

      <TaskProgress view={pageCaptureKind.describe(job)} className="mt-3 max-w-md" />

      {job.error ? (
        <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs break-words text-danger">
          {retryNote(job)}
          {job.error}
        </p>
      ) : null}
    </article>
  )
}
