import { isPdfJobActive, pdfStatusLabels, type PdfJob } from '@/lib/api/file-conversion'
import type { StatusTone } from '@/types'

type JobState = Pick<PdfJob, 'status' | 'cancelRequested'>

/** A cancel was requested but the worker has not stopped yet. */
export function isJobStopping(job: JobState): boolean {
  return job.cancelRequested && isPdfJobActive(job)
}

export function jobStatusLabel(job: JobState): string {
  if (isJobStopping(job)) return '结束中'
  return pdfStatusLabels[job.status] || job.status
}

export function jobStatusTone(job: JobState): StatusTone {
  if (job.status === 'succeeded') return 'success'
  if (job.status === 'partial' || isJobStopping(job)) return 'warning'
  if (job.status === 'failed') return 'danger'
  return isPdfJobActive(job) ? 'info' : 'neutral'
}

/** GitHub Actions run behind the job, when the dispatcher recorded a numeric id. */
export function jobRunUrl(job: Pick<PdfJob, 'githubRunId'>): string | null {
  if (!/^[0-9]+$/.test(job.githubRunId)) return null
  return `https://github.com/ActiveInsighter/file-converter-ai/actions/runs/${job.githubRunId}`
}

/** "第 3–40 页" when the job converts only part of the PDF. */
export function jobPageRange(job: Pick<PdfJob, 'startPage' | 'endPage'>): string {
  const { startPage: start, endPage: end } = job
  if (!start && !end) return ''
  if (start && end) return start === end ? `第 ${start} 页` : `第 ${start}–${end} 页`
  return start ? `第 ${start} 页起` : `前 ${end} 页`
}

function parseTime(value: string | undefined): number {
  if (!value) return Number.NaN
  return Date.parse(value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /u, '$1T'))
}

function minutesText(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000))
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/** How long the converter has been running, or took; empty before it starts. */
export function jobDuration(job: Pick<PdfJob, 'status' | 'startedAt' | 'finishedAt'>, now = Date.now()): string {
  const started = parseTime(job.startedAt)
  if (Number.isNaN(started)) return ''
  if (isPdfJobActive(job)) return `已运行 ${minutesText(now - started)}`
  const finished = parseTime(job.finishedAt)
  return Number.isNaN(finished) ? '' : `用时 ${minutesText(finished - started)}`
}
