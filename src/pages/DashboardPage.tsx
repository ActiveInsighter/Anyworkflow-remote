import { useMemo, useState } from 'react'
import { Copy, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, LoadingState, PageHeader, ProgressBar, StatusBadge } from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/useAsyncData'
import { cloneRun, deleteRun, listAllRuns, toErrorMessage } from '@/lib/api'
import { formatDateTime, modeLabel, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { DispatchRunRecord } from '@/types'

type FilterKey = 'all' | 'draft' | 'active' | 'done'

function matchesFilter(run: DispatchRunRecord, filter: FilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'draft') return run.status === 'draft'
  if (filter === 'active') return run.status === 'queued' || run.status === 'running'
  return ['succeeded', 'failed', 'canceled'].includes(run.status)
}

export function DashboardPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [actingId, setActingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DispatchRunRecord | null>(null)

  const state = useAsyncData(
    async () => listAllRuns(),
    [session?.record.id],
    { enabled: Boolean(session), pollMs: 8000, errorMessage: toErrorMessage },
  )

  const runs = state.data || []
  const visibleRuns = useMemo(() => runs.filter((run) => matchesFilter(run, filter)), [runs, filter])
  const counts = useMemo(() => ({
    all: runs.length,
    draft: runs.filter((run) => run.status === 'draft').length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'running').length,
    done: runs.filter((run) => ['succeeded', 'failed', 'canceled'].includes(run.status)).length,
  }), [runs])

  async function copyRun(run: DispatchRunRecord, status: 'draft' | 'queued') {
    if (actingId) return
    setActingId(run.id)
    setActionError('')
    try {
      const copied = await cloneRun(run, status)
      navigate(status === 'draft' ? '/runs/' + copied.id + '/edit' : '/runs/' + copied.id)
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
        <EmptyState title="未连接" action={<Button asChild><Link to="/settings">连接</Link></Button>} />
      </AppPage>
    )
  }

  return (
    <AppPage>
      <PageHeader
        title="工作流"
        actions={
          <>
            <Button variant="ghost" size="icon" onClick={() => void state.reload()} disabled={state.loading} aria-label="刷新">
              <RefreshCw className={state.loading ? 'animate-spin' : ''} />
            </Button>
            <Button asChild>
              <Link to="/runs/new"><Plus />新建</Link>
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterKey)}>
        <TabsList className="w-full sm:w-auto">
          {([
            ['all', '全部', counts.all],
            ['draft', '草稿', counts.draft],
            ['active', '进行中', counts.active],
            ['done', '已结束', counts.done],
          ] as const).map(([value, label, count]) => (
            <TabsTrigger key={value} value={value}>
              <span>{label}</span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {state.loading && !state.data ? <LoadingState /> : null}

        {visibleRuns.length ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            {visibleRuns.map((run) => {
              const status = runStatusMeta(run.status, run.requestedAction)
              const percent = progressPercent(run.completedTasks, run.totalTasks)
              const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
              const canDelete = run.status === 'draft' || terminal

              return (
                <div
                  key={run.id}
                  className="border-b p-4 last:border-b-0 hover:bg-muted/20"
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_180px_130px_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link to={'/runs/' + run.id} className="truncate text-sm font-semibold tracking-[-0.015em] hover:underline">
                          {run.title || '未命名 Run'}
                        </Link>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {modeLabel(run.executionMode, run.maxConcurrency, '任务')}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>{progressText(run.completedTasks, run.totalTasks, 'Tasks')}</span>
                        <span>{Math.round(percent)}%</span>
                      </div>
                      <ProgressBar value={percent} tone={status.tone} />
                    </div>

                    <div className="text-[11px] text-muted-foreground md:text-right">
                      {formatDateTime(run.updated)}
                    </div>

                    <div className="flex flex-wrap items-center gap-1 md:justify-end">
                      {run.status === 'draft' ? (
                        <Button size="sm" variant="ghost" onClick={() => navigate('/runs/' + run.id + '/edit')}>
                          <Pencil />编辑
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => void copyRun(run, 'draft')} disabled={Boolean(actingId) || !run.planText.trim()}>
                        <Copy />复制
                      </Button>
                      {terminal ? (
                        <Button size="sm" variant="ghost" onClick={() => void copyRun(run, 'queued')} disabled={Boolean(actingId) || !run.planText.trim()}>
                          <RotateCcw />重跑
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(run)}
                          disabled={Boolean(actingId)}
                        >
                          <Trash2 />
                          <span className="md:hidden">删除</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </Tabs>

      {!state.loading && visibleRuns.length === 0 ? (
        <EmptyState
          title="暂无 Run"
          action={filter === 'all' ? <Button asChild><Link to="/runs/new"><Plus />新建</Link></Button> : undefined}
        />
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
