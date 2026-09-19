import { useMemo, useState } from 'react'
import { Copy, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  ListRow,
  LoadingState,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
  Toolbar,
} from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { ScheduleBadge } from '@/components/app/schedule-picker'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData, invalidateAsyncDataCache } from '@/hooks/useAsyncData'
import { useNow } from '@/hooks/useNow'
import { cloneRun, deleteRun, listRuns, toErrorMessage } from '@/lib/api'
import { formatDateTime, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { DispatchRunRecord, DispatchStatus, PocketBaseListResponse } from '@/types'

type FilterKey = 'all' | 'draft' | 'active' | 'done'

const PAGE_SIZE = 30
const filterKeys: readonly FilterKey[] = ['all', 'draft', 'active', 'done']

const FILTER_STATUSES: Record<FilterKey, readonly DispatchStatus[]> = {
  all: [],
  draft: ['draft'],
  active: ['queued', 'running'],
  done: ['succeeded', 'failed', 'canceled'],
}

function readFilter(value: string | null): FilterKey {
  return filterKeys.includes(value as FilterKey) ? (value as FilterKey) : 'all'
}

function readPage(value: string | null): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function DashboardPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = readFilter(searchParams.get('filter'))
  const pageNumber = readPage(searchParams.get('page'))
  const [actingId, setActingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DispatchRunRecord | null>(null)
  const now = useNow()

  const ownerId = session?.record.id || ''
  const cacheKey = `runs:${ownerId}:${filter}:page-${pageNumber}`
  const state = useAsyncData<PocketBaseListResponse<DispatchRunRecord>>(
    async () => listRuns(pageNumber, PAGE_SIZE, FILTER_STATUSES[filter]),
    [ownerId, filter, pageNumber],
    {
      enabled: Boolean(session),
      pollMs: 15000,
      staleMs: 12000,
      cacheKey,
      errorMessage: toErrorMessage,
    },
  )

  const page = state.data
  const runs = page?.items || []
  const loadedCount = runs.length

  const sortedRuns = useMemo(() => runs, [runs])

  function changeFilter(next: FilterKey) {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('filter')
    else params.set('filter', next)
    params.delete('page')
    setSearchParams(params, { replace: true })
  }

  function changePage(next: number) {
    const params = new URLSearchParams(searchParams)
    if (next <= 1) params.delete('page')
    else params.set('page', String(next))
    setSearchParams(params)
  }

  async function copyRun(run: DispatchRunRecord, status: 'draft' | 'queued') {
    if (actingId) return
    setActingId(run.id)
    setActionError('')
    try {
      const copied = await cloneRun(run, status)
      invalidateAsyncDataCache(`runs:${ownerId}:`)
      navigate(status === 'draft' ? `/runs/${copied.id}/edit` : `/runs/${copied.id}`)
    } catch (error) {
      setActionError(toErrorMessage(error))
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
      setDeleteTarget(null)
      invalidateAsyncDataCache(`runs:${ownerId}:`)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActingId('')
    }
  }

  if (!session) {
    return (
      <AppPage>
        <PageHeader title="工作流" />
        <EmptyState title="未连接" action={<Button asChild><Link to="/settings">前往设置</Link></Button>} />
      </AppPage>
    )
  }

  return (
    <AppPage>
      <PageHeader
        title="工作流"
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => void state.reload()} disabled={state.loading} aria-label="刷新">
              <RefreshCw className={state.loading ? 'animate-spin' : undefined} />
            </Button>
            <Button asChild>
              <Link to="/runs/new"><Plus />新建</Link>
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Toolbar className="mb-4 justify-between">
        <Tabs value={filter} onValueChange={(value) => changeFilter(readFilter(value))}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="draft">草稿</TabsTrigger>
            <TabsTrigger value="active">进行中</TabsTrigger>
            <TabsTrigger value="done">已结束</TabsTrigger>
          </TabsList>
        </Tabs>
        {page ? <span className="text-xs tabular-nums text-muted-foreground">{loadedCount} / {page.totalItems}</span> : null}
      </Toolbar>

      {state.loading && !state.data ? <LoadingState /> : null}

      {sortedRuns.length ? (
        <Panel>
          {sortedRuns.map((run) => {
            const status = runStatusMeta(run.status, run.requestedAction)
            const percent = progressPercent(run.completedTasks, run.totalTasks)
            const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
            const canDelete = run.status === 'draft' || terminal

            return (
              <ListRow
                key={run.id}
                className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_160px_110px_auto] md:items-center md:gap-5"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      to={`/runs/${run.id}`}
                      className="truncate text-[13px] font-semibold tracking-[-0.015em] outline-none hover:underline focus-visible:underline"
                    >
                      {run.title || '未命名 Run'}
                    </Link>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    <ScheduleBadge value={run.scheduledAt} now={now} />
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{formatDateTime(run.updated)}</div>
                </div>

                <div className="min-w-0">
                  <div className="mb-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {progressText(run.completedTasks, run.totalTasks, 'Tasks')}
                  </div>
                  <ProgressBar value={percent} tone={status.tone} />
                </div>

                <div className="text-[11px] tabular-nums text-muted-foreground">{run.executionMode === 'parallel' ? `并行 ${run.maxConcurrency}` : '串行'}</div>

                <div className="flex items-center justify-end gap-1">
                  {run.status === 'draft' ? (
                    <Button size="icon" variant="ghost" asChild aria-label="编辑">
                      <Link to={`/runs/${run.id}/edit`}><Pencil /></Link>
                    </Button>
                  ) : null}
                  <Button size="icon" variant="ghost" onClick={() => void copyRun(run, 'draft')} disabled={Boolean(actingId)} aria-label="复制为草稿">
                    <Copy />
                  </Button>
                  {terminal ? (
                    <Button size="icon" variant="ghost" onClick={() => void copyRun(run, 'queued')} disabled={Boolean(actingId)} aria-label="重跑">
                      <RotateCcw />
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(run)} disabled={Boolean(actingId)} aria-label="删除">
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </ListRow>
            )
          })}
        </Panel>
      ) : state.data ? (
        <EmptyState title={filter === 'all' ? '还没有 Run' : '当前筛选没有 Run'} />
      ) : null}

      {page && page.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => changePage(page.page - 1)} disabled={page.page <= 1}>上一页</Button>
          <span className="px-2 text-xs tabular-nums text-muted-foreground">{page.page} / {page.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => changePage(page.page + 1)} disabled={page.page >= page.totalPages}>下一页</Button>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="删除 Run？"
        description={deleteTarget?.title || '未命名 Run'}
        busy={Boolean(actingId)}
        onConfirm={() => void confirmDelete()}
      />
    </AppPage>
  )
}
