import { ChevronRight, CircleStop, Download, ExternalLink, RotateCcw } from 'lucide-react'
import { DescriptionList } from '@/components/data-display/description-list'
import { StatusBadge } from '@/components/data-display/status-badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Spinner } from '@/components/ui/spinner'
import { isPdfJobActive, isPdfJobTerminal, type PdfJob } from '@/lib/api/file-conversion'
import { formatDateTime, formatFileSize } from '@/lib/format'
import { jobRunUrl, jobStatusLabel, jobStatusTone } from '../lib/job-status'

/** One conversion: status, artifact, the parameters it ran with, and the actions its state allows. */
export function ConversionJobItem({
  job,
  pending,
  busy,
  onCancel,
  onRerun,
  onDownload,
}: {
  job: PdfJob
  /** Key of the running row action, `${jobId}:${action}`. */
  pending: string | null
  busy: boolean
  onCancel: () => void
  onRerun: () => void
  onDownload: () => void
}) {
  const runUrl = jobRunUrl(job)
  const is = (action: string) => pending === `${job.id}:${action}`
  const stopping = job.cancelRequested || is('cancel')

  return (
    <article className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body font-medium break-all">{job.title}</h3>
          <p className="mt-1 text-xs break-all text-muted-foreground">
            {job.outputName}.zip
            {job.fileSize > 0 ? ` · ${formatFileSize(job.fileSize)}` : ''} · 提交于 {formatDateTime(job.created)}
          </p>
        </div>
        <StatusBadge tone={jobStatusTone(job)} className="shrink-0">
          {jobStatusLabel(job)}
        </StatusBadge>
      </div>

      {job.error ? <p className="mt-2 text-xs break-words text-danger">{job.error}</p> : null}

      <Collapsible className="group/params mt-2">
        <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8">
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 transition-transform duration-fast group-data-[state=open]/params:rotate-90"
          />
          查看参数
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 pt-2 text-xs break-all text-muted-foreground">
          <p>{job.sourceUrl}</p>
          {job.prompt ? <p>本次要求：{job.prompt}</p> : null}
          {job.systemPrompt ? <p className="line-clamp-6 whitespace-pre-wrap">系统提示词：{job.systemPrompt}</p> : null}
          <DescriptionList
            columns={3}
            className="gap-y-3"
            items={Object.entries(job.options || {}).map(([key, value]) => ({
              label: <span className="font-mono">{key}</span>,
              value: <span className="text-xs">{String(value) || '自动'}</span>,
            }))}
          />
          {job.finishedAt ? <p>结束于 {formatDateTime(job.finishedAt)}</p> : null}
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-3 flex flex-wrap gap-2">
        {isPdfJobActive(job) ? (
          <Button size="sm" variant="outline" disabled={busy || job.cancelRequested} onClick={onCancel}>
            {is('cancel') ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
            {stopping ? '结束中…' : '结束任务'}
          </Button>
        ) : null}
        {isPdfJobTerminal(job) ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={onRerun}>
            {is('rerun') ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
            {is('rerun') ? '重跑中…' : '重跑'}
          </Button>
        ) : null}
        {job.file ? (
          <Button size="sm" disabled={busy} onClick={onDownload}>
            {is('download') ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
            {is('download') ? '下载中…' : '下载 ZIP'}
          </Button>
        ) : null}
        {runUrl ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={runUrl} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" />
              运行详情
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  )
}
