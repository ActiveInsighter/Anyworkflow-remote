import { useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api/errors'
import {
  MAX_TARGETS_PER_RUN,
  busyTargetIds,
  cancelCrawlRun,
  createCrawlTarget,
  deleteCrawlTarget,
  listActiveCrawlRuns,
  listCrawlTargets,
  newCrawlId,
  startCrawl,
  targetInputFor,
  updateCrawlTarget,
} from '@/lib/api/web-crawl'
import { notifyTasksChanged } from '@/lib/tasks'
import type { CrawlRun, CrawlTarget, CrawlTargetInput } from '@/types/web-crawl'

/** A crawl takes about a minute; follow it closely, and look in now and then when nothing runs. */
const ACTIVE_POLL_MS = 4_000
const IDLE_POLL_MS = 30_000

export interface AddOutcome {
  created: CrawlTarget[]
  failed: { url: string; message: string }[]
  started: number
}

export type TargetSettings = Omit<CrawlTargetInput, 'url' | 'name'>

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

/**
 * The owner's pages and what is crawling now, plus every write. Creates and runs reuse an id
 * until the server accepts them, so retrying after a lost response never duplicates anything.
 * `settled` increments whenever a run finishes, so contents and history can refresh with it.
 */
export function useWebCrawl() {
  const [page, setPage] = useState(1)
  const activeRef = useRef(false)
  const runs = useAsyncData((signal) => listActiveCrawlRuns(signal), [], {
    pollMs: (data) => (data?.length ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  const targets = useAsyncData((signal) => listCrawlTargets(page, signal), [page], {
    pollMs: () => (activeRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS),
  })
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [settled, setSettled] = useState(0)
  const creating = useAsyncAction()
  const action = useAsyncAction()
  const targetIds = useRef(new Map<string, string>())
  const runIds = useRef(new Map<string, string>())

  const active = useMemo(() => runs.data ?? [], [runs.data])
  const busy = useMemo(() => busyTargetIds(active), [active])
  const runByTarget = useMemo(() => {
    const map = new Map<string, CrawlRun>()
    for (const run of active) for (const id of run.targets) map.set(id, run)
    return map
  }, [active])

  // A run that leaves the active list has finished: its targets carry a new outcome.
  const previous = useRef<Set<string>>(new Set())
  const { reload: reloadTargets } = targets
  useEffect(() => {
    activeRef.current = active.length > 0
    const now = new Set(active.map((run) => run.id))
    const finished = [...previous.current].some((id) => !now.has(id))
    previous.current = now
    if (finished) {
      setSettled((value) => value + 1)
      void reloadTargets()
    }
  }, [active, reloadTargets])

  async function refresh() {
    await Promise.all([runs.reload(), targets.reload()])
  }

  /** Starts runs of up to 10 for the given targets, skipping those already crawling. */
  async function launch(ids: string[]): Promise<number> {
    const idle = ids.filter((id) => !busy.has(id))
    let started = 0
    for (const batch of chunks(idle, MAX_TARGETS_PER_RUN)) {
      const key = [...batch].sort().join(',')
      const id = runIds.current.get(key) ?? newCrawlId()
      runIds.current.set(key, id)
      await startCrawl(id, batch)
      runIds.current.delete(key)
      started += batch.length
    }
    if (started) notifyTasksChanged()
    return started
  }

  async function add(urls: string[], settings: TargetSettings, crawlNow: boolean): Promise<AddOutcome | undefined> {
    return creating.run(
      'add',
      async () => {
        const outcome: AddOutcome = { created: [], failed: [], started: 0 }
        for (const url of urls) {
          const id = targetIds.current.get(url) ?? newCrawlId()
          targetIds.current.set(url, id)
          try {
            outcome.created.push(await createCrawlTarget(id, targetInputFor(url, settings)))
            targetIds.current.delete(url)
          } catch (cause) {
            outcome.failed.push({ url, message: toErrorMessage(cause) })
          }
        }
        if (crawlNow && outcome.created.length) outcome.started = await launch(outcome.created.map((target) => target.id))
        if (outcome.created.length) {
          if (page !== 1) setPage(1)
          await refresh()
        }
        return outcome
      },
      { failure: false },
    )
  }

  function crawl(ids: string[], key = 'crawl') {
    return action.run(
      key,
      async () => {
        const started = await launch(ids)
        await refresh()
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

  async function remove(items: CrawlTarget[]): Promise<boolean> {
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

  function cancel(run: CrawlRun) {
    return action.run(
      `${run.id}:cancel`,
      async () => {
        await cancelCrawlRun(run)
        notifyTasksChanged()
        await runs.reload()
      },
      { failure: '无法取消抓取' },
    )
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
    busy,
    runByTarget,
    settled,
    selected,
    setSelected,
    toggleSelected,
    adding: creating.busy,
    addError: creating.error,
    pending: action.pending,
    working: action.busy,
    add,
    crawl,
    update,
    setScheduled,
    remove,
    cancel,
    refresh,
  }
}

export type WebCrawlState = ReturnType<typeof useWebCrawl>
