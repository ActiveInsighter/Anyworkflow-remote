import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
} from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { invalidateAsyncDataCache, useAsyncData } from '@/hooks/useAsyncData'
import { cloneRun, deleteRun, listRuns, toErrorMessage, type RunListFilter } from '@/lib/api'
import { formatDateTime, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { DispatchRunRecord } from '@/types'
import { toast } from 'sonner'

const filterKeys: readonly RunListFilter[] = ['all', 'draft', 'active', 'done', 'failed', 'canceled']
const PAGE_SIZE = 20

function readFilter(value: string | null): RunListFilter {
  return filterKeys.includes(value as RunListFilter) ? (value as RunListFilter) : 'all'
}

function readPage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function DashboardPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = readFilter(searchParams.get('filter'))
  const page = readPage(searchParams.get('page'))
  const query = searchParams.get('q')?.trim() || ''
  const [searchInput, setSearchInput] = useState(query)
  const [actionTarget, setActionTarget] = useState<DispatchRunRecord | null>(null)

  useEffect(() => setSearchInput(query), [query])
  useEffect(() => {
    if (searchInput.trim() === query) return
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (searchInput.trim()) params.set('q', searchInput.trim())
      else params.delete('q')
      params.delete('page')
      setSearchParams(params, { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, query, searchParams, setSearchParams])
  const [actingId, setActingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DispatchRunRecord | null>(null)

  const state = useAsyncData(
    (signal) => listRuns(page, PAGE_SIZE, filter, query, signal),
    [session?.record.id, page, filter, query],
    {
      enabled: Boolean(session),
      pollMs: filter === 'active' || filter === 'all' ? 12_000 : undefined,
      staleMs: 10_000,
      cacheKey: session ? `runs:${session.record.id}:${filter}:${page}:${JSON.stringify(query)}` : undefined,
      errorMessage: toErrorMessage,
    },
  )

  const runs = state.data?.items ?? []

  function updateQuery(next: { filter?: RunListFilter; page?: number }) {
    const params = new URLSearchParams(searchParams)
    if (next.filter !== undefined) {
      if (next.filter === 'all') params.delete('filter')
      else params.set('filter', next.filter)
      params.delete('page')
    }
    if (next.page !== undefined) {
      if (next.page <= 1) params.delete('page')
      else params.set('page', String(next.page))
    }
    setSearchParams(params, { replace: true })
  }

  async function copyRun(run: DispatchRunRecord, status: 'draft' | 'queued') {
    if (actingId) return
    setActingId(run.id)
    setActionError('')
    try {
      const copied = await cloneRun(run, status)
      invalidateAsyncDataCache('runs:')
      toast.success(status === 'draft' ? '已复制为草稿' : '已创建重跑')
      navigate(status === 'draft' ? '/runs/' + copied.id + '/edit' : '/runs/' + copied.id)
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('操作失败', { description: message })
    } finally {
      setActingId('')
    }
  }

  async function confirmDelete() {
    const run = deleteTarget
    if (!run || actingId) return
    setActingId(run.id)
    setActionError('')
    try {
      await deleteRun(run)
      invalidateAsyncDataCache('runs:')
      setDeleteTarget(null)
      if (page > 1 && state.data?.items.length === 1) {
        updateQuery({ page: page - 1 })
      } else {
        await state.reload()
      }
      toast.success('Run 已删除')
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('删除失败', { description: message })
    } finally {
      setActingId('')
    }
  }

  if (!session) {
    return (
      <AppPage>
        <PageHeader title="工作流" />
        <EmptyState
          title="未连接"
          action={
            <Button asChild variant="secondary">
              <Link to="/settings">设置连接</Link>
            </Button>
          }
        />
      </AppPage>
    )
  }

  return (
    <AppPage>
      <PageHeader
        title="工作流"
        className="flex-row items-center justify-between gap-2 [&>div:last-child]:w-auto"
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void state.reload()}
              disabled={state.loading || state.refreshing}
              aria-label="刷新"
            >
              <RefreshCw className={state.refreshing ? 'animate-spin' : undefined} />
            </Button>
            <Button asChild variant="secondary">
              <Link to="/runs/new">
                <Plus />
                新建
              </Link>
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            aria-label="搜索工作流"
            type="search"
            placeholder="搜索名称或 Run ID"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="h-11 bg-card ps-10 pe-10 text-base sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {searchInput ? (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-0 top-0 size-11"
              aria-label="清除搜索"
              onClick={() => setSearchInput('')}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <Tabs value={filter} onValueChange={(value) => updateQuery({ filter: readFilter(value) })}>
          <TabsList
            aria-label="运行状态"
            className="grid h-auto w-full grid-cols-6 gap-0 sm:gap-1 [&_button]:h-10 [&_button]:px-1"
          >
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="draft">草稿</TabsTrigger>
            <TabsTrigger value="active">进行中</TabsTrigger>
            <TabsTrigger value="done">已完成</TabsTrigger>
            <TabsTrigger value="failed">失败</TabsTrigger>
            <TabsTrigger value="canceled">取消</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center justify-between text-xs text-muted-foreground" role="status">
          <span className="min-w-0 flex-1 truncate pe-3" title={query || undefined}>{query ? `搜索“${query}”` : '运行记录'}</span>
          <span className="shrink-0">{state.refreshing ? '更新中…' : state.data ? `${state.data.totalItems} 条` : '加载中…'}</span>
        </div>
      </div>

      {state.loading && !state.data ? <LoadingState /> : null}

      {runs.length ? (
        <Panel>
          {runs.map((run) => {
            const status = runStatusMeta(run.status, run.requestedAction)
            const percent = progressPercent(run.completedTasks, run.totalTasks)
            const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
            return (
              <article key={run.id} className="border-b border-border px-3 py-4 last:border-b-0 sm:px-5">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={'/runs/' + run.id}
                      className="block break-words text-sm font-semibold leading-6 outline-none hover:underline focus-visible:underline"
                    >
                      {run.title || '未命名 Run'}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <GitBranch className="size-3.5" />v{run.versionMajor}.{run.versionMinor}
                      </span>
                      <time dateTime={run.updated}>{formatDateTime(run.updated)}</time>
                      <span>{progressText(run.completedTasks, run.totalTasks, 'Tasks')}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-11"
                      aria-label={`操作 ${run.title || '未命名 Run'}`}
                      onClick={() => setActionTarget(run)}
                    >
                      <MoreHorizontal />
                    </Button>
                  </div>
                </div>
                {!terminal && run.status !== 'draft' ? (
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressBar className="flex-1" value={percent} tone={status.tone} />
                    <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
                  </div>
                ) : null}
              </article>
            )
          })}
        </Panel>
      ) : null}

      {!state.loading && state.data && runs.length === 0 ? (
        <EmptyState
          title={query ? '没有找到匹配的工作流' : filter === 'all' ? '还没有 Run' : '没有匹配的 Run'}
          action={
            query ? (
              <Button variant="outline" onClick={() => setSearchInput('')}>
                清除搜索
              </Button>
            ) : filter === 'all' ? (
              <Button asChild variant="secondary">
                <Link to="/runs/new">
                  <Plus />
                  新建
                </Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => updateQuery({ filter: 'all' })}>
                查看全部
              </Button>
            )
          }
        />
      ) : null}

      {state.data && state.data.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            {state.data.totalItems} 条 · 第 {state.data.page}/{state.data.totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => updateQuery({ page: page - 1 })}
            >
              <ChevronLeft />
              上一页
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= state.data.totalPages}
              onClick={() => updateQuery({ page: page + 1 })}
            >
              下一页
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(actionTarget)}
        onOpenChange={(open) => {
          if (!open) setActionTarget(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>工作流操作</DialogTitle>
            <DialogDescription className="break-words">{actionTarget?.title}</DialogDescription>
          </DialogHeader>
          {actionTarget ? (
            <div className="grid gap-2 [&_button]:min-h-11 [&_button]:justify-start">
              {['draft', 'succeeded', 'failed', 'canceled'].includes(actionTarget.status) ? (
                <Button variant="outline" onClick={() => navigate(`/runs/${actionTarget.id}/edit`)}>
                  <Pencil />
                  编辑
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={Boolean(actingId)}
                onClick={() => {
                  setActionTarget(null)
                  void copyRun(actionTarget, 'draft')
                }}
              >
                <Copy />
                复制为草稿
              </Button>
              {['succeeded', 'failed', 'canceled'].includes(actionTarget.status) ? (
                <Button
                  variant="outline"
                  disabled={Boolean(actingId)}
                  onClick={() => {
                    setActionTarget(null)
                    void copyRun(actionTarget, 'queued')
                  }}
                >
                  <RotateCcw />
                  完整重跑
                </Button>
              ) : null}
              {['draft', 'succeeded', 'failed', 'canceled'].includes(actionTarget.status) ? (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={Boolean(actingId)}
                  onClick={() => {
                    setDeleteTarget(actionTarget)
                    setActionTarget(null)
                  }}
                >
                  <Trash2 />
                  删除
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !actingId) setDeleteTarget(null)
        }}
        title="删除 Run？"
        description={deleteTarget?.title || '未命名 Run'}
        busy={Boolean(deleteTarget && actingId === deleteTarget.id)}
        onConfirm={() => void confirmDelete()}
      />
    </AppPage>
  )
}
