import { useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api/errors'
import {
  cancelCrawlJob,
  crawlTarget,
  createCrawlJob,
  createCrawlTarget,
  deleteCrawlJob,
  deleteCrawlTarget,
  isCrawlWorkerOnline,
  listActiveCrawlJobs,
  listCrawlTargets,
  listCrawlWorkers,
  newCrawlId,
  rerunCrawlJob,
  updateCrawlTarget,
  type CrawlRequest,
} from '@/lib/api/crawl'
import { notifyTasksChanged } from '@/lib/tasks'
import type { CrawlJob, CrawlRunner, CrawlTarget, CrawlTargetInput } from '@/types/crawl'

/** A crawl takes seconds to a minute; follow it closely, and look in now and then when nothing runs. */
const ACTIVE_POLL_MS = 3_000
const IDLE_POLL_MS = 30_000
const WORKER_POLL_MS = 30_000

export interface SubmitOutcome {
  /** Links accepted: jobs queued, or pages saved. */
  accepted: number
  /** Saved pages whose first crawl could not be queued. */
  notStarted: number
  failed: { url: string; message: string }[]
}

export interface SubmitRequest extends Omit<CrawlRequest, 'url'> {
  /** Save the links as pages crawled on this schedule (0: only when asked), instead of crawling once. */
  save: { intervalMinutes: number } | null
}

/**
 * Everything the crawl page writes, plus what it follows live: the saved pages, every queued or
 * running job, and whether an extension is online. Creates reuse an id until the server accepts
 * them, so retrying after a lost response never duplicates a page or a job. `revision` moves
 * whenever a job is added or finishes, so history and contents can reload with it.
 */
export function useCrawl() {
  const [page, setPage] = useState(1)
  const activeRef = useRef(false)
  const active = useAsyncData((signal) => listActiveCrawlJobs(signal), [], {
    pollMs: (data) => (data?.length ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  const targets = useAsyncData((signal) => listCrawlTargets(page, signal), [page], {
    pollMs: () => (activeRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  const workers = useAsyncData((signal) => listCrawlWorkers(signal), [], { pollMs: WORKER_POLL_MS })
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [revision, setRevision] = useState(0)
  const submitting = useAsyncAction()
  const action = useAsyncAction()
  const ids = useRef(new Map<string, string>())

  const activeJobs = useMemo(() => active.data ?? [], [active.data])
  const jobByTarget = useMemo(() => {
    const map = new Map<string, CrawlJob>()
    for (const job of activeJobs) if (job.target) map.set(job.target, job)
    return map
  }, [activeJobs])
  const online = useMemo(() => (workers.data ?? []).filter((worker) => isCrawlWorkerOnline(worker)), [workers.data])
  const waitingForBrowser = activeJobs.some((job) => job.runner === 'browser' && job.status === 'queued')

  // A job that leaves the active list has finished: its page and the history carry the outcome.
  const previous = useRef<Set<string>>(new Set())
  const { reload: reloadTargets } = targets
  useEffect(() => {
    activeRef.current = activeJobs.length > 0
    const now = new Set(activeJobs.map((job) => job.id))
    const finished = [...previous.current].some((id) => !now.has(id))
    previous.current = now
    if (finished) {
      setRevision((value) => value + 1)
      void reloadTargets()
    }
  }, [activeJobs, reloadTargets])

  /** The id for a create, kept until the server accepts it. */
  function idFor(key: string): string {
    const id = ids.current.get(key) ?? newCrawlId()
    ids.current.set(key, id)
    return id
  }

  async function changed() {
    notifyTasksChanged()
    setRevision((value) => value + 1)
    await Promise.all([active.reload(), targets.reload()])
  }

  /** Queues a crawl of each page that is not already crawling. */
  async function queueTargets(items: CrawlTarget[]): Promise<{ started: number; failed: number }> {
    let started = 0
    let failed = 0
    for (const target of items.filter((item) => !jobByTarget.has(item.id))) {
      const key = `target:${target.id}`
      try {
        await crawlTarget(idFor(key), target)
        ids.current.delete(key)
        started += 1
      } catch {
        failed += 1
      }
    }
    return { started, failed }
  }

  /**
   * One request per link, so one rejected link does not lose the others: a job for each, or a
   * saved page for each followed by its first crawl.
   */
  async function submit(urls: string[], input: SubmitRequest): Promise<SubmitOutcome | undefined> {
    return submitting.run(
      'submit',
      async () => {
        const outcome: SubmitOutcome = { accepted: 0, notStarted: 0, failed: [] }
        const saved: CrawlTarget[] = []
        for (const url of urls) {
          const key = `${input.save ? 'page' : 'job'}:${url}`
          try {
            if (input.save) {
              const target: CrawlTargetInput = {
                url,
                name: '',
                runner: input.runner,
                category: input.category,
                options: input.options,
                intervalMinutes: input.save.intervalMinutes,
                enabled: input.save.intervalMinutes > 0,
              }
              saved.push(await createCrawlTarget(idFor(key), target))
            } else {
              await createCrawlJob(idFor(key), { ...input, url })
            }
            ids.current.delete(key)
            outcome.accepted += 1
          } catch (cause) {
            outcome.failed.push({ url, message: toErrorMessage(cause) })
          }
        }
        if (saved.length) {
          outcome.notStarted = (await queueTargets(saved)).failed
          if (page !== 1) setPage(1)
        }
        if (outcome.accepted) await changed()
        return outcome
      },
      { failure: false },
    )
  }

  function crawl(items: CrawlTarget[], key = 'crawl') {
    return action.run(
      key,
      async () => {
        const { started, failed } = await queueTargets(items)
        if (started) await changed()
        if (!started && failed) throw new Error('页面没有开始抓取，请稍后再试')
        return started
      },
      { failure: '无法开始抓取' },
    )
  }

  function update(target: CrawlTarget, patch: Partial<CrawlTargetInput>, success?: string) {
    return action.run(
      `${target.id}:update`,
      async () => {
        const saved = await updateCrawlTarget(target, patch)
        targets.setData((current) => current && { ...current, items: current.items.map((item) => (item.id === saved.id ? saved : item)) })
        return saved
      },
      { success, failure: '保存失败' },
    )
  }

  function setScheduled(target: CrawlTarget, enabled: boolean) {
    return update(target, { enabled }, enabled ? '已恢复定时抓取' : '已暂停定时抓取')
  }

  async function pause(items: CrawlTarget[]): Promise<boolean> {
    const done = await action.run(
      'pause',
      async () => {
        for (const target of items) await updateCrawlTarget(target, { enabled: false })
        await targets.reload()
        return true
      },
      { success: '已暂停所选页面的定时抓取', failure: '暂停失败' },
    )
    return Boolean(done)
  }

  async function removeTargets(items: CrawlTarget[]): Promise<boolean> {
    const done = await action.run(
      'delete',
      async () => {
        for (const target of items) await deleteCrawlTarget(target)
        setSelected((current) => new Set([...current].filter((id) => !items.some((target) => target.id === id))))
        await targets.reload()
        return true
      },
      { success: items.length > 1 ? `已删除 ${items.length} 个页面` : '已删除页面', failure: '删除失败' },
    )
    return Boolean(done)
  }

  function cancel(job: CrawlJob) {
    return action.run(
      `${job.id}:cancel`,
      async () => {
        await cancelCrawlJob(job)
        await changed()
      },
      { failure: '无法取消抓取' },
    )
  }

  function rerun(job: CrawlJob, runner: CrawlRunner = job.runner) {
    const key = `rerun:${job.id}:${runner}`
    return action.run(
      `${job.id}:rerun`,
      async () => {
        await rerunCrawlJob(idFor(key), job, runner)
        ids.current.delete(key)
        await changed()
      },
      { success: runner === job.runner ? '已重新提交' : `已改用${runner === 'browser' ? '浏览器' : '云端'}抓取`, failure: '无法重新抓取' },
    )
  }

  async function removeJob(job: CrawlJob): Promise<boolean> {
    const done = await action.run(
      `${job.id}:delete`,
      async () => {
        await deleteCrawlJob(job)
        setRevision((value) => value + 1)
        return true
      },
      { success: '记录已删除', failure: '删除失败' },
    )
    return Boolean(done)
  }

  function toggleSelected(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return {
    targets,
    page,
    setPage,
    active,
    activeJobs,
    jobByTarget,
    workers,
    online,
    waitingForBrowser,
    revision,
    selected,
    setSelected,
    toggleSelected,
    submitting: submitting.busy,
    submitError: submitting.error,
    pending: action.pending,
    working: action.busy,
    submit,
    crawl,
    update,
    setScheduled,
    pause,
    removeTargets,
    cancel,
    rerun,
    removeJob,
    refresh: changed,
  }
}

export type CrawlState = ReturnType<typeof useCrawl>
