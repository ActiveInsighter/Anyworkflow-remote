import { ListTree } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { LoadingState } from '@/components/feedback/loading-state'
import { SectionHeader } from '@/components/layout/page'
import { Pager } from '@/components/navigation/pager'
import { Card } from '@/components/ui/card'
import type { DispatchRunRecord, DispatchTaskRecord, PocketBaseListResponse } from '@/types'
import type { RunDeepLink } from '../../hooks/use-run-detail'
import { TaskNode } from '../hierarchy/task-node'

/** The execution tree root: one page of Tasks, each expandable into Events, Acts and messages. */
export function RunTaskList({
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
  return (
    <section aria-labelledby="run-tasks-heading" className="mt-8">
      <SectionHeader
        title={<span id="run-tasks-heading">执行记录</span>}
        trailing={tasks ? `${tasks.totalItems} Tasks` : null}
      />
      {!tasks && loading ? <LoadingState label="加载 Task…" /> : null}
      {tasks?.items.length ? (
        <Card className="divide-y">
          {tasks.items.map((task) => (
            <TaskNode key={task.id} task={task} deepLink={deepLink} />
          ))}
        </Card>
      ) : null}
      {tasks && tasks.items.length === 0 ? (
        <EmptyState icon={ListTree} title={run.status === 'draft' ? '草稿尚未运行' : '暂无 Task'} />
      ) : null}
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
  )
}
