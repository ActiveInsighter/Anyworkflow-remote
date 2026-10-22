import { ChevronRight, CircleStop, Download, ExternalLink, RotateCcw } from 'lucide-react'
import { DescriptionList } from '@/components/data-display/description-list'
import { StatusBadge } from '@/components/data-display/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Spinner } from '@/components/ui/spinner'
import { isPdfJobActive, isPdfJobTerminal, type PdfJob } from '@/lib/api/file-conversion'
import { formatDateTime, formatFileSize } from '@/lib/format'
import { describeJobOption } from '../lib/conversion-options'
import { jobDuration, jobPageRange, jobRunUrl, jobStatusLabel, jobStatusTone } from '../lib/job-status'

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
  const pages = jobPageRange(job)
  const duration = jobDuration(job)
  const meta = [
    `${job.outputName}.zip`,
    job.fileSize > 0 ? formatFileSize(job.fileSize) : '',
    formatDateTime(job.created),
    duration,
  ].filter(Boolean)
  const parameters = Object.entries(job.options || {})
    .map(([key, value]) => describeJobOption(key, value))
    .filter((item) => item !== null)

  return (
    <article className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-body font-medium break-all">{job.title}</h3>
            <StatusBadge tone={jobStatusTone(job)} className="shrink-0">
              {jobStatusLabel(job)}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs break-all text-muted-foreground tabular-nums">{meta.join(' · ')}</p>
          {pages || job.options?.adjacent_pages ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pages ? <Badge variant="neutral">{pages}</Badge> : null}
              {job.options?.adjacent_pages ? <Badge variant="neutral">附带相邻页</Badge> : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {job.file ? (
            <Button size="sm" disabled={busy} onClick={onDownload}>
              {is('download') ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              {is('download') ? '下载中…' : '下载 ZIP'}
            </Button>
          ) : null}
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
          {runUrl ? (
            <Button size="sm" variant="ghost" asChild>
              <a href={runUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                运行详情
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {job.error ? <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs break-words text-danger">{job.error}</p> : null}

      <Collapsible className="group/params mt-2">
        <CollapsibleTrigger className="-mx-1 flex min-h-touch items-center gap-1 rounded-md px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8">
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 transition-transform duration-fast group-data-[state=open]/params:rotate-90"
          />
          查看参数
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 rounded-md border bg-muted/30 p-3 text-xs break-all text-muted-foreground sm:p-4">
          <DescriptionList
            columns={3}
            className="gap-y-3"
            items={[
              { label: '源文件', value: <span className="font-mono text-xs font-normal">{job.sourceUrl}</span> },
            ]}
          />
          <DescriptionList
            columns={3}
            className="gap-y-3"
            items={parameters.map((item) => ({
              label: item.label,
              value: <span className="text-xs">{item.value}</span>,
            }))}
          />
          {job.prompt ? <p className="whitespace-pre-wrap">本次要求：{job.prompt}</p> : null}
          {job.systemPrompt ? <p className="line-clamp-4 whitespace-pre-wrap">系统提示词：{job.systemPrompt}</p> : null}
          {job.finishedAt ? <p>结束于 {formatDateTime(job.finishedAt)}</p> : null}
        </CollapsibleContent>
      </Collapsible>
    </article>
  )
}
