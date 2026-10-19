import type * as React from 'react'
import { ChevronsDownUp, ListTree, LocateFixed } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { LoadingState } from '@/components/feedback/loading-state'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { isActiveStatus } from '@/lib/domain/run-status'
import type { DispatchRunRecord, DispatchTaskRecord, PocketBaseListResponse } from '@/types'
import { ExecutionExpansionProvider, expansionKey, useExpansionMode } from '../../hooks/use-execution-expansion'
import type { RunDeepLink } from '../../hooks/use-run-detail'
import { TaskNode } from './task-node'

function emptyTitle(run: DispatchRunRecord): string {
  if (run.status === 'draft') return '草稿尚未运行'
  return isActiveStatus(run.status) ? '等待云端编排 Task' : '暂无 Task'
}

/** Switches the tree between following progress and everything collapsed; both clear manual toggles. */
function ExpansionToggle() {
  const [mode, setMode] = useExpansionMode()
  const following = mode === 'follow'
  return (
    <Button
      size="sm"
      variant="ghost"
      className="-me-2 h-8 text-xs text-muted-foreground"
      onClick={() => setMode(following ? 'collapsed' : 'follow')}
    >
      {following ? <ChevronsDownUp data-icon="inline-start" /> : <LocateFixed data-icon="inline-start" />}
      {following ? '全部收起' : '定位进度'}
    </Button>
  )
}

/**
 * The execution tree root: one page of Tasks, each opening into an Event timeline, Acts and
 * messages. Open/closed state lives in one store keyed by this Run, so refreshes never reset it.
 */
export function ExecutionRecord({
  run,
  tasks,
  loading,
  page,
  onPageChange,
  deepLink,
}: {
  run: DispatchRunRecord
  tasks: PocketBaseListResponse<DispatchTaskRecord> | null
  loading: boolean
  page: number
  onPageChange: (page: number) => void
  deepLink: RunDeepLink
}) {
  const openKeys = [
    ...(deepLink.taskId ? [expansionKey.task(deepLink.taskId)] : []),
    ...(deepLink.eventId ? [expansionKey.event(deepLink.eventId)] : []),
  ]
  const items = tasks?.items ?? []

  return (
    <ExecutionExpansionProvider key={run.id} openKeys={openKeys}>
      <section aria-labelledby="run-tasks-heading" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 id="run-tasks-heading" className="text-sm font-semibold tracking-snug">
              执行记录
            </h2>
            {tasks ? (
              <span className="text-caption text-muted-foreground tabular-nums">{tasks.totalItems} Tasks</span>
            ) : null}
          </div>
          {items.length ? <ExpansionToggle /> : null}
        </div>
        {!tasks && loading ? <LoadingState label="加载 Task…" /> : null}
        {items.length ? (
          <ol aria-label="Task 列表" className="flex flex-col gap-2.5">
            {items.map((task, index) => (
              <li key={task.id} className="animate-enter" style={{ '--stagger-index': index } as React.CSSProperties}>
                <TaskNode task={task} deepLink={deepLink} onlyTask={tasks?.totalItems === 1} />
              </li>
            ))}
          </ol>
        ) : null}
        {tasks && items.length === 0 ? <EmptyState icon={ListTree} title={emptyTitle(run)} /> : null}
        {tasks ? (
          <Pager
            label="Task 分页"
            page={page}
            totalPages={tasks.totalPages}
            totalItems={tasks.totalItems}
            onPageChange={onPageChange}
          />
        ) : null}
      </section>
    </ExecutionExpansionProvider>
  )
}
