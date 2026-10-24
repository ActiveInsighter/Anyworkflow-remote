import { Download } from 'lucide-react'
import { StatusBadge } from '@/components/data-display/status-badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { canDownloadRunExport, isRunExportActive } from '@/lib/api/run-exports'
import { formatDateTime, formatFileSize } from '@/lib/format'
import type { RunExportRecord } from '@/types/run-export'

const labels = { queued: '等待导出', collecting: '整理对话', packaging: '打包中', succeeded: '已完成', failed: '导出失败', expired: '已过期' } as const

export function RunExportItem({ job, busy, downloading, onDownload }: {
  job: RunExportRecord; busy: boolean; downloading: boolean; onDownload: () => void
}) {
  const active = isRunExportActive(job)
  const available = canDownloadRunExport(job)
  const tone = job.status === 'failed' ? 'danger' : job.status === 'succeeded' ? 'success' : active ? 'info' : 'neutral'
  return (
    <article className="flex min-w-0 flex-col gap-2 py-3" aria-label={`${job.contentMode === 'assistant' ? '仅 AI 回复' : '完整对话'}导出`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{job.contentMode === 'assistant' ? '仅 AI 回复' : '完整对话'}</span>
          <StatusBadge tone={tone}>{job.status === 'succeeded' && !available ? '已过期' : labels[job.status]}</StatusBadge>
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
          <p className="text-xs text-muted-foreground">{job.error || `${labels[job.status]}，可关闭窗口稍后回来查看。`}</p>
          <Progress value={job.progress} aria-label="导出进度" />
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
