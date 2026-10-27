import { createContext, use, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAsyncData } from '@/hooks/use-async-data'
import { useSession } from '@/lib/api/session'
import { onTasksChanged } from '@/lib/tasks'
import { TASK_SOURCES, type TaskItem } from '../lib/sources'

/** Settled tasks stay listed for a day, so a finished conversion is easy to find again. */
const RECENT_MS = 24 * 60 * 60_000
/** Running work changes quickly; queued work (often scheduled) and an idle feed slowly. */
const POLL_RUNNING_MS = 5_000
const POLL_QUEUED_MS = 20_000
const POLL_IDLE_MS = 60_000

interface TaskFeed {
  items: TaskItem[]
  /** Kinds whose feed failed; the others still show. */
  failed: string[]
}

export interface TaskCenterState {
  items: TaskItem[]
  active: TaskItem[]
  recent: TaskItem[]
  loading: boolean
  error: string
  reload: () => Promise<void>
}

const TaskCenterContext = createContext<TaskCenterState | null>(null)

async function loadFeed(signal: AbortSignal): Promise<TaskFeed> {
  const since = Date.now() - RECENT_MS
  const results = await Promise.allSettled(TASK_SOURCES.map((source) => source.load({ since }, signal)))
  const failed = TASK_SOURCES.filter((_, index) => results[index].status === 'rejected').map((source) => source.label)
  if (failed.length === TASK_SOURCES.length) throw (results[0] as PromiseRejectedResult).reason
  const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  // Newest change first; the panel splits active and settled itself.
  items.sort((left, right) => right.updated.localeCompare(left.updated))
  return { items, failed }
}

function pollFor(items: TaskItem[]): number {
  if (items.some((item) => item.view.state === 'running')) return POLL_RUNNING_MS
  if (items.some((item) => item.view.state === 'queued')) return POLL_QUEUED_MS
  return POLL_IDLE_MS
}

/** Announce tasks that settled since the previous poll; the first load only sets the baseline. */
function useSettledToasts(items: TaskItem[] | undefined) {
  const navigate = useNavigate()
  const previous = useRef<Map<string, TaskItem> | null>(null)
  useEffect(() => {
    if (!items) return
    const before = previous.current
    previous.current = new Map(items.map((item) => [item.key, item]))
    if (!before) return
    for (const item of items) {
      if (item.view.active || !before.get(item.key)?.view.active) continue
      const action = { label: '查看', onClick: () => navigate(item.href) }
      const title = `「${item.title}」`
      if (item.view.state === 'succeeded') toast.success(`${title}已完成`, { action })
      else if (item.view.state === 'partial') toast.warning(`${title}部分完成`, { action })
      else if (item.view.state === 'failed') toast.error(`${title}失败`, { description: item.error || undefined, action })
      else if (item.view.state === 'canceled') toast(`${title}已取消`, { action })
    }
  }, [items, navigate])
}

/**
 * Follows every async task kind for the signed-in account: one poll for conversions, exports and
 * Runs, faster while anything runs, paused in hidden tabs, and reloaded at once when a feature
 * reports a change (notifyTasksChanged).
 */
export function TaskCenterProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const feed = useAsyncData(loadFeed, [session?.baseUrl, session?.record.id], {
    enabled: Boolean(session),
    pollMs: (data) => pollFor(data?.items ?? []),
    staleMs: 3_000,
    cacheKey: session ? `task-center:${session.baseUrl}:${session.record.id}` : undefined,
  })
  const items = feed.data?.items
  const { reload } = feed

  useEffect(() => onTasksChanged(() => void reload()), [reload])
  useSettledToasts(items)

  const value = useMemo<TaskCenterState>(() => {
    const all = items ?? []
    const failed = feed.data?.failed ?? []
    return {
      items: all,
      active: all.filter((item) => item.view.active),
      recent: all.filter((item) => !item.view.active),
      loading: feed.loading,
      error: feed.error || (failed.length ? `${failed.join('、')}暂时无法刷新` : ''),
      reload,
    }
  }, [items, feed.data?.failed, feed.loading, feed.error, reload])

  return <TaskCenterContext value={value}>{children}</TaskCenterContext>
}

export function useTaskCenter(): TaskCenterState {
  const state = use(TaskCenterContext)
  if (!state) throw new Error('useTaskCenter must be used inside <TaskCenterProvider>.')
  return state
}
