import { useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
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
  Toolbar,
} from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { invalidateAsyncDataCache, useAsyncData } from '@/hooks/useAsyncData'
import { cloneRun, deleteRun, listRuns, toErrorMessage, type RunListFilter } from '@/lib/api'
import { formatDateTime, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { DispatchRunRecord } from '@/types'
import { toast } from 'sonner'

const filterKeys: readonly RunListFilter[] = ['all', 'draft', 'active', 'done']
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
  const [actingId, setActingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DispatchRunRecord | null>(null)

  const state = useAsyncData(
    async () => listRuns(page, PAGE_SIZE, filter),
    [session?.record.id, page, filter],
    {
      enabled: Boolean(session),
      pollMs: filter === 'active' || filter === 'all' ? 12_000 : undefined,
      staleMs: 10_000,
      cacheKey: session ? `runs:${session.record.id}:${filter}:${page}` : undefined,
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
        <EmptyState title="未连接" action={<Button asChild variant="secondary"><Link to="/settings">设置连接</Link></Button>} />
      </AppPage>
    )
  }

  return (
    <AppPage>
      <PageHeader
        title="工作流"
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
              <Link to="/runs/new"><Plus />新建</Link>
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Toolbar className="mb-3">
        <Tabs value={filter} onValueChange={(value) => updateQuery({ filter: readFilter(value) })}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="draft">草稿</TabsTrigger>
            <TabsTrigger value="active">进行中</TabsTrigger>
            <TabsTrigger value="done">已结束</TabsTrigger>
          </TabsList>
        </Tabs>
      </Toolbar>

      {state.loading && !state.data ? <LoadingState /> : null}

      {runs.length ? (
        <Panel>
          {runs.map((run) => {
            const status = runStatusMeta(run.status, run.requestedAction)
            const percent = progressPercent(run.completedTasks, run.totalTasks)
            const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
            const canDelete = run.status === 'draft' || terminal

            return (
              <article
                key={run.id}
                className="grid min-h-[132px] grid-rows-[auto_auto_32px] gap-3 border-b border-border p-4 last:border-b-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Link
                    to={'/runs/' + run.id}
                    className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.015em] outline-none hover:underline focus-visible:underline"
                  >
                    {run.title || '未命名 Run'}
                  </Link>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>

                <div className="self-center">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{progressText(run.completedTasks, run.totalTasks, 'Tasks')}</span>
                    <span className="tabular-nums">{Math.round(percent)}%</span>
                  </div>
                  <ProgressBar value={percent} tone={status.tone} />
                </div>

                <div className="flex h-8 items-center justify-between gap-3">
                  <time className="min-w-0 truncate text-[11px] leading-none tabular-nums text-muted-foreground">
                    {formatDateTime(run.updated)}
                  </time>

                  <div className="flex h-8 shrink-0 items-center justify-end gap-0.5">
                    {run.status === 'draft' ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => navigate('/runs/' + run.id + '/edit')}
                        aria-label="编辑"
                        title="编辑"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    ) : null}

                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void copyRun(run, 'draft')}
                      disabled={Boolean(actingId) || !run.planText.trim()}
                      aria-label="复制"
                      title="复制"
                    >
                      <Copy className="size-4" />
                    </Button>

                    {terminal ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => void copyRun(run, 'queued')}
                        disabled={Boolean(actingId) || !run.planText.trim()}
                        aria-label="重跑"
                        title="重跑"
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    ) : null}

                    {canDelete ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(run)}
                        disabled={Boolean(actingId)}
                        aria-label={'删除 ' + (run.title || '未命名 Run')}
                        title="删除"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </Panel>
      ) : null}

      {!state.loading && state.data && runs.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? '还没有 Run' : '没有匹配的 Run'}
          action={
            filter === 'all'
              ? <Button asChild variant="secondary"><Link to="/runs/new"><Plus />新建</Link></Button>
              : <Button variant="outline" onClick={() => updateQuery({ filter: 'all' })}>查看全部</Button>
          }
        />
      ) : null}

      {state.data && state.data.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{state.data.totalItems} 条 · 第 {state.data.page}/{state.data.totalPages} 页</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => updateQuery({ page: page - 1 })}
            >
              <ChevronLeft />上一页
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= state.data.totalPages}
              onClick={() => updateQuery({ page: page + 1 })}
            >
              下一页<ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open && !actingId) setDeleteTarget(null) }}
        title="删除 Run？"
        description={deleteTarget?.title || '未命名 Run'}
        busy={Boolean(deleteTarget && actingId === deleteTarget.id)}
        onConfirm={() => void confirmDelete()}
      />
    </AppPage>
  )
}
