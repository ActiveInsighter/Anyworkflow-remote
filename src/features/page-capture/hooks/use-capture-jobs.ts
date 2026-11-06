import { useRef, useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api/errors'
import {
  cancelCaptureJob,
  createCaptureJob,
  deleteCaptureJob,
  isCaptureJobActive,
  listCaptureJobs,
  listCaptureWorkers,
  newCaptureId,
  rerunCaptureJob,
} from '@/lib/api/page-capture'
import { notifyTasksChanged } from '@/lib/tasks'
import type { CaptureJob, CaptureOptions } from '@/types/page-capture'

/** A capture takes seconds, so follow it closely; an idle history only needs an occasional look. */
const ACTIVE_POLL_MS = 3_000
const IDLE_POLL_MS = 30_000
const WORKER_POLL_MS = 30_000

export interface SubmitOutcome {
  created: number
  failed: { url: string; message: string }[]
}

/**
 * Paged capture history plus every job write. A batch is one create per URL, so one rejected link
 * does not lose the others. Ids are kept per URL until it is accepted, which makes a retry after
 * a lost response safe.
 */
export function useCaptureJobs() {
  const [page, setPage] = useState(1)
  const jobs = useAsyncData((signal) => listCaptureJobs(page, signal), [page], {
    pollMs: (data) => (data?.items.some(isCaptureJobActive) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  const workers = useAsyncData((signal) => listCaptureWorkers(signal), [], { pollMs: WORKER_POLL_MS })
  const creating = useAsyncAction()
  const action = useAsyncAction()
  const pendingIds = useRef(new Map<string, string>())
  const rerunIds = useRef(new Map<string, string>())

  async function showLatest() {
    if (page !== 1) setPage(1)
    else await jobs.reload()
  }

  async function submit(urls: string[], options: CaptureOptions): Promise<SubmitOutcome | undefined> {
    return creating.run(
      'create',
      async () => {
        const outcome: SubmitOutcome = { created: 0, failed: [] }
        for (const url of urls) {
          const id = pendingIds.current.get(url) ?? newCaptureId()
          pendingIds.current.set(url, id)
          try {
            await createCaptureJob(id, url, options)
            pendingIds.current.delete(url)
            outcome.created += 1
          } catch (cause) {
            outcome.failed.push({ url, message: toErrorMessage(cause) })
          }
        }
        if (outcome.created) {
          notifyTasksChanged()
          await showLatest()
        }
        return outcome
      },
      { failure: false },
    )
  }

  function cancel(job: CaptureJob) {
    void action.run(
      `${job.id}:cancel`,
      async () => {
        await cancelCaptureJob(job)
        notifyTasksChanged()
        await jobs.reload()
      },
      { failure: false },
    )
  }

  function rerun(job: CaptureJob) {
    const id = rerunIds.current.get(job.id) ?? newCaptureId()
    rerunIds.current.set(job.id, id)
    void action.run(
      `${job.id}:rerun`,
      async () => {
        await rerunCaptureJob(id, job)
        rerunIds.current.delete(job.id)
        notifyTasksChanged()
        await showLatest()
      },
      { success: '已重新加入采集队列', failure: false },
    )
  }

  async function remove(job: CaptureJob): Promise<boolean> {
    const done = await action.run(
      `${job.id}:delete`,
      async () => {
        await deleteCaptureJob(job)
        await jobs.reload()
        return true
      },
      { success: '采集记录已删除', failure: false },
    )
    return Boolean(done)
  }

  return {
    jobs,
    workers,
    page,
    setPage,
    creating: creating.busy,
    createError: creating.error,
    pending: action.pending,
    busy: action.busy,
    error: action.error,
    submit,
    cancel,
    rerun,
    remove,
  }
}

export type CaptureJobsState = ReturnType<typeof useCaptureJobs>
