import { Link } from 'react-router'
import { Plus, SearchX, Workflow } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { Button } from '@/components/ui/button'
import type { RunListFilter } from '@/lib/api'

/** Empty result, worded for why it is empty: a search, a filter, or no Runs at all. */
export function RunListEmpty({
  filter,
  query,
  onClearSearch,
  onShowAll,
}: {
  filter: RunListFilter
  query: string
  onClearSearch: () => void
  onShowAll: () => void
}) {
  if (query) {
    return (
      <EmptyState
        icon={SearchX}
        title="没有找到匹配的工作流"
        description="试试其他名称或 Run ID。"
        action={
          <Button variant="outline" onClick={onClearSearch}>
            清除搜索
          </Button>
        }
      />
    )
  }
  if (filter === 'all') {
    return (
      <EmptyState
        icon={Workflow}
        title="还没有 Run"
        description="新建一个工作流，开始编排任务。"
        action={
          <Button asChild variant="secondary">
            <Link to="/runs/new">
              <Plus data-icon="inline-start" />
              新建
            </Link>
          </Button>
        }
      />
    )
  }
  return (
    <EmptyState
      title="没有匹配的 Run"
      action={
        <Button variant="outline" onClick={onShowAll}>
          查看全部
        </Button>
      }
    />
  )
}
