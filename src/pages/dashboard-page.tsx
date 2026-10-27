import { useState } from 'react'
import { Link } from 'react-router'
import { Plus, RefreshCw, Unplug } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Page, PageHeader } from '@/components/layout/page'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/api/session'
import { runTitle } from '@/lib/domain/run-status'
import type { DispatchRunRecord } from '@/types'
import { RunActionsMenu } from '@/features/runs/components/run-actions-menu'
import { RunFilterTabs } from '@/features/runs/components/run-list/run-filter-tabs'
import { RunList } from '@/features/runs/components/run-list/run-list'
import { RunListEmpty } from '@/features/runs/components/run-list/run-list-empty'
import { RunListItem } from '@/features/runs/components/run-list/run-list-item'
import { useRunList } from '@/features/runs/hooks/use-run-list'
import { useRunListActions } from '@/features/runs/hooks/use-run-list-actions'
import { useRunListQuery } from '@/features/runs/hooks/use-run-list-query'

export function DashboardPage() {
  const session = useSession()
  const listQuery = useRunListQuery()
  const { filter, page, query } = listQuery
  const state = useRunList({ filter, page, query })
  const [deleteTarget, setDeleteTarget] = useState<DispatchRunRecord | null>(null)
  const actions = useRunListActions({
    onDeleted: async () => {
      setDeleteTarget(null)
      if (page > 1 && state.data?.items.length === 1) listQuery.setPage(page - 1)
      else await state.reload()
    },
  })
  const runs = state.data?.items ?? []

  if (!session) {
    return (
      <Page>
        <PageHeader title="工作流" />
        <EmptyState
          icon={Unplug}
          title="未连接"
          description="连接后端后，即可查看和运行工作流。"
          action={
            <Button asChild variant="secondary">
              <Link to="/settings">设置连接</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        compact
        title="工作流"
        description="编排任务，追踪每一次执行。"
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-touch"
              onClick={() => void state.reload()}
              disabled={state.loading || state.refreshing}
              aria-label="刷新"
            >
              <RefreshCw className={state.refreshing ? 'animate-spin' : undefined} />
            </Button>
            <Button asChild size="touch">
              <Link to="/runs/new">
                <Plus data-icon="inline-start" />
                <span className="sm:hidden">新建</span>
                <span className="hidden sm:inline">新建工作流</span>
              </Link>
            </Button>
          </>
        }
      />

      <ErrorAlert
        action={
          !state.data ? (
            <Button size="sm" variant="outline" onClick={() => void state.reload()} disabled={state.loading || state.refreshing}>
              重试
            </Button>
          ) : null
        }
      >
        {state.error}
      </ErrorAlert>
      <ErrorAlert>{actions.error}</ErrorAlert>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <RunFilterTabs value={filter} onValueChange={listQuery.setFilter} />
          <SearchField
            size="touch"
            className="lg:w-80 [&_input]:text-base sm:[&_input]:text-sm"
            label="搜索工作流"
            placeholder="搜索名称或 Run ID"
            value={listQuery.searchInput}
            onValueChange={listQuery.setSearchInput}
          />
        </div>
        <div className="flex items-center justify-between px-0.5 text-caption text-muted-foreground" role="status">
          <span className="min-w-0 flex-1 truncate pe-3" title={query || undefined}>
            {query ? `搜索“${query}”` : '运行记录'}
          </span>
          <span className="shrink-0 font-mono tabular-nums">
            {state.refreshing ? '更新中…' : state.data ? `${state.data.totalItems} 条` : state.error ? '加载失败' : '加载中…'}
          </span>
        </div>
      </div>

      {state.loading && !state.data ? <LoadingState /> : null}

      {runs.length ? (
        <RunList>
          {runs.map((run) => (
            <RunListItem
              key={run.id}
              run={run}
              actions={
                <RunActionsMenu run={run} disabled={actions.busy} onCopy={actions.copy} onDelete={setDeleteTarget} />
              }
            />
          ))}
        </RunList>
      ) : null}

      {!state.loading && state.data && runs.length === 0 ? (
        <RunListEmpty
          filter={filter}
          query={query}
          onClearSearch={() => listQuery.setSearchInput('')}
          onShowAll={() => listQuery.setFilter('all')}
        />
      ) : null}

      {state.data ? (
        <Pager
          className="mt-4"
          page={page}
          totalPages={state.data.totalPages}
          totalItems={state.data.totalItems}
          onPageChange={listQuery.setPage}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="删除 Run？"
        description={runTitle(deleteTarget)}
        busy={Boolean(deleteTarget && actions.pendingId === deleteTarget.id)}
        onConfirm={() => {
          if (deleteTarget) void actions.remove(deleteTarget)
        }}
      />
    </Page>
  )
}
