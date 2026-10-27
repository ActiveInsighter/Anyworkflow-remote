import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TaskProgress, TaskStatusBadge } from '@/features/tasks'
import { canDownloadRunExport, isRunExportActive } from '@/lib/api/run-exports'
import { formatDateTime, formatFileSize } from '@/lib/format'
import { runExportKind, taskStatusMeta } from '@/lib/tasks'
import type { RunExportRecord } from '@/types/run-export'

export function RunExportItem({ job, busy, downloading, onDownload }: {
  job: RunExportRecord; busy: boolean; downloading: boolean; onDownload: () => void
}) {
  const active = isRunExportActive(job)
  const available = canDownloadRunExport(job)
  // A ZIP past its retention reads as expired even before the backend sweep marks it.
  const record = job.status === 'succeeded' && !available ? { ...job, status: 'expired' as const } : job
  return (
    <article className="flex min-w-0 flex-col gap-2 py-3" aria-label={`${job.contentMode === 'assistant' ? '仅 AI 回复' : '完整对话'}导出`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{job.contentMode === 'assistant' ? '仅 AI 回复' : '完整对话'}</span>
          <TaskStatusBadge kind={runExportKind} record={record} />
        </div>
        {available ? (
          <Button size="sm" disabled={busy} onClick={onDownload}>
            {downloading ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <Download aria-hidden="true" data-icon="inline-start" />}
            {downloading ? '下载中…' : '下载 ZIP'}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(job.created)}</p>
      {active ? (
        <div className="flex flex-col gap-1.5" role="status">
          <p className="text-xs text-muted-foreground">{job.error || `${taskStatusMeta(runExportKind, job).label}，可关闭窗口稍后回来查看。`}</p>
          <TaskProgress view={runExportKind.describe(job)} />
        </div>
      ) : null}
      {job.status === 'succeeded' ? (
        <p className="text-xs text-muted-foreground">{job.documentCount} 份 Markdown · {job.messageCount} 条消息 · {formatFileSize(job.fileSize)}</p>
      ) : null}
      {available ? <p className="text-xs text-muted-foreground">有效期至 {formatDateTime(job.expiresAt)}</p> : null}
      {job.status === 'failed' ? <p role="alert" className="text-xs break-words text-danger">{job.error || '导出失败，请重新导出'}</p> : null}
      {job.warnings?.length ? (
        <p className="text-xs break-words text-warning">包含 {job.warnings.length} 条导出说明，请查看 ZIP 中的 README.md。</p>
      ) : null}
    </article>
  )
}
