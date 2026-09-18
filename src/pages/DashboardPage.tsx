import { useMemo, useState } from 'react'
import { Copy, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, LoadingState, PageHeader, ProgressBar, StatusBadge } from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
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
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActingId('')
    }
  }

  if (!session) {
    return (
      <AppPage className="pb-12">
        <PageHeader
          eyebrow="AnyWorkflow Remote"
          title="远程工作流控制台"
          description="使用同一套 AnyWorkflow 后端，在电脑和手机浏览器中管理 Run、Task 与 Event。"
        />
        <EmptyState
          title="还没有连接 AnyWorkflow"
          description="连接现有 PocketBase 账号后即可读取你的小程序工作流，不需要修改后端。"
          action={<Button asChild><Link to="/settings">连接账号</Link></Button>}
        />
      </AppPage>
    )
  }

  return (
    <AppPage className="pb-12">
      <PageHeader
        eyebrow="工作流"
        title="我的 Run"
        description="查看草稿、运行中和已结束的工作流。运行状态会自动同步。"
        actions={
          <>
            <Button variant="outline" onClick={() => void state.reload()} disabled={state.loading}>
              <RefreshCw className={state.loading ? 'animate-spin' : ''} />
              刷新
            </Button>
            <Button asChild>
              <Link to="/runs/new"><Plus />新建 Run</Link>
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterKey)} className="gap-5">
        <div className="overflow-x-auto">
          <TabsList className="min-w-full justify-start sm:min-w-0">
            {([
              ['all', '全部', counts.all],
              ['draft', '草稿', counts.draft],
              ['active', '进行中', counts.active],
              ['done', '已结束', counts.done],
            ] as const).map(([value, label, count]) => (
              <TabsTrigger key={value} value={value} className="min-w-[84px] gap-1.5 px-2 sm:min-w-0 sm:px-3">
                <span>{label}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {state.loading && !state.data ? <LoadingState label="正在同步 Run…" /> : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {visibleRuns.map((run) => {
            const status = runStatusMeta(run.status, run.requestedAction)
            const percent = progressPercent(run.completedTasks, run.totalTasks)
            const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
            const canDelete = run.status === 'draft' || terminal

            return (
              <Card key={run.id} className="overflow-hidden transition-colors hover:border-foreground/15">
                <CardHeader className="gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link to={`/runs/${run.id}`} className="block truncate text-base font-semibold tracking-tight hover:underline">
                        {run.title || '未命名 Run'}
                      </Link>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {run.status === 'draft' ? '尚未发布' : `${run.totalTasks} 个任务组`} · {modeLabel(run.executionMode, run.maxConcurrency, '任务')}
                      </p>
                    </div>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </div>

                  <ProgressBar value={percent} tone={status.tone} className="mt-1" />

                  <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span>{progressText(run.completedTasks, run.totalTasks, 'Tasks')}</span>
                    <span>{formatDateTime(run.updated)}</span>
                  </div>
                </CardHeader>

                <CardContent className="px-4 pb-3 pt-0 sm:px-5">
                  <Button variant="ghost" className="h-8 w-full justify-start px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" asChild>
                    <Link to={`/runs/${run.id}`}>查看详情</Link>
                  </Button>
                </CardContent>

                <CardFooter className="flex flex-wrap justify-end gap-1 border-t bg-transparent p-2.5">
                  {run.status === 'draft' ? (
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/runs/${run.id}/edit`)}>
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
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/8 hover:text-destructive" onClick={() => setDeleteTarget(run)} disabled={Boolean(actingId)}>
                      <Trash2 />删除
                    </Button>
                  ) : null}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </Tabs>

      {!state.loading && visibleRuns.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={filter === 'all' ? '从第一个工作流开始' : '这个分类暂时没有 Run'}
            description={filter === 'all' ? '创建草稿后，可在网页或小程序继续编辑和发布。' : undefined}
            action={filter === 'all' ? <Button asChild><Link to="/runs/new"><Plus />新建 Run</Link></Button> : undefined}
          />
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open && !actingId) setDeleteTarget(null) }}
        title="删除 Run？"
        description={`“${deleteTarget?.title || '未命名 Run'}”删除后无法恢复。`}
        busy={Boolean(deleteTarget && actingId === deleteTarget.id)}
        onConfirm={() => void confirmDelete()}
      />
    </AppPage>
  )
}
