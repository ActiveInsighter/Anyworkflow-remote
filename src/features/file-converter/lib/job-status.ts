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
