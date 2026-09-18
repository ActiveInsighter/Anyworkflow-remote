import { Copy, Pencil, Pause, Play, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppPage, ErrorBanner, LoadingState, MetaGrid, PageHeader, ProgressBar, SectionHeading, StatusBadge } from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  cloneRun,
  commandRun,
  deleteRun,
  getRun,
  listAllTasksForRun,
  toErrorMessage,
  updateRunDraft,
} from '@/lib/api'
import { formatDateTime, modeLabel, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import type { DispatchRequestedAction, DispatchRunRecord } from '@/types'

interface RunSnapshot {
  run: DispatchRunRecord
  tasks: Awaited<ReturnType<typeof listAllTasksForRun>>
}

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const navigate = useNavigate()
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const state = useAsyncData<RunSnapshot>(
    async () => {
      const [run, tasks] = await Promise.all([getRun(runId), listAllTasksForRun(runId)])
      return { run, tasks }
    },
    [runId],
    { enabled: Boolean(runId), pollMs: 5000, errorMessage: toErrorMessage },
  )

  async function control(action: Exclude<DispatchRequestedAction, 'none'>) {
    const run = state.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      await commandRun(run, action)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function publishDraft() {
    const run = state.data?.run
    if (!run || run.status !== 'draft' || acting) return
    setActing(true)
    setActionError('')
    try {
      await updateRunDraft(run.id, run.planText, true)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function copy(status: 'draft' | 'queued') {
    const run = state.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      const copied = await cloneRun(run, status)
      navigate(status === 'draft' ? `/runs/${copied.id}/edit` : `/runs/${copied.id}`)
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function remove() {
    const run = state.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      await deleteRun(run)
      setConfirmDeleteOpen(false)
      navigate('/')
    } catch (error) {
      setActionError(toErrorMessage(error))
      setActing(false)
    }
  }

  if (state.loading && !state.data) return <AppPage><LoadingState label="正在读取 Run…" /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data) return null

  const { run, tasks } = state.data
  const status = runStatusMeta(run.status, run.requestedAction)
  const totalTasks = Math.max(run.totalTasks, tasks.length)
  const percent = progressPercent(run.completedTasks, totalTasks)
  const active = run.status === 'queued' || run.status === 'running'
  const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
  const canPause = active && run.requestedAction === 'none'
  const canResume = active && run.requestedAction === 'pause'
  const canCancel = active && run.requestedAction !== 'cancel'

  return (
    <AppPage>
      <PageHeader
        eyebrow="Run"
        title={run.title || '未命名 Run'}
        description={modeLabel(run.executionMode, run.maxConcurrency, '任务')}
        actions={
          <>
            {run.status === 'draft' ? <Button variant="outline" asChild><Link to={`/runs/${run.id}/edit`}><Pencil />编辑</Link></Button> : null}
            {run.status === 'draft' ? <Button onClick={() => void publishDraft()} disabled={acting}><Play />开始运行</Button> : null}
            {canPause ? <Button variant="outline" onClick={() => void control('pause')} disabled={acting}><Pause />暂停</Button> : null}
            {canResume ? <Button onClick={() => void control('resume')} disabled={acting}><Play />继续</Button> : null}
            {canCancel ? <Button variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消</Button> : null}
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Card>
        <CardHeader className="gap-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">执行概览</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{progressText(run.completedTasks, totalTasks, 'Tasks')}</h2>
            </div>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <ProgressBar value={percent} tone={status.tone} />
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
          <MetaGrid items={[
            { label: '调度方式', value: modeLabel(run.executionMode, run.maxConcurrency, '任务') },
            { label: '活跃任务', value: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length },
            { label: '更新时间', value: formatDateTime(run.updated) },
            { label: '命令版本', value: run.commandVersion },
          ]} />
          {run.lastError ? <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive">{run.lastError}</div> : null}
        </CardContent>
      </Card>

      <SectionHeading eyebrow="Tasks" title="任务组" trailing={`${tasks.length} 项`} />

      <div className="grid gap-2.5">
        {tasks.map((task) => {
          const taskStatus = runStatusMeta(task.status, task.requestedAction)
          return (
            <Link
              className="group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm transition-colors hover:border-foreground/15 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:p-4"
              to={`/tasks/${task.id}`}
              key={task.id}
            >
              <div className="grid size-10 place-items-center rounded-lg bg-accent text-[11px] font-semibold text-accent-foreground sm:size-11">
                {String(task.runIndex + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="truncate text-sm font-semibold">{task.title || `Task ${task.runIndex + 1}`}</h3>
                  <StatusBadge tone={taskStatus.tone}>{taskStatus.label}</StatusBadge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{modeLabel(task.executionMode, task.maxConcurrency, '事件')} · {progressText(task.completedEvents, task.totalEvents, 'Events')}</p>
                <ProgressBar className="mt-2" value={progressPercent(task.completedEvents, task.totalEvents)} tone={taskStatus.tone} />
              </div>
              <span className="hidden text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block">›</span>
            </Link>
          )
        })}
      </div>

      {!tasks.length && run.status !== 'draft' ? (
        <Card className="mt-3 border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">云端正在编排 Task，页面会自动刷新。</Card>
      ) : null}

      <Card className="mt-8">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">更多操作</p>
            <h2 className="mt-1 text-base font-semibold">复制与清理</h2>
            <p className="mt-1 text-xs text-muted-foreground">复制只复用工作流定义，不复制运行时状态。</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => void copy('draft')} disabled={acting || !run.planText.trim()}><Copy />复制为草稿</Button>
            {terminal ? <Button variant="outline" onClick={() => void copy('queued')} disabled={acting || !run.planText.trim()}><RotateCcw />重新运行</Button> : null}
            {(run.status === 'draft' || terminal) ? <Button variant="destructive" onClick={() => setConfirmDeleteOpen(true)} disabled={acting}><Trash2 />删除 Run</Button> : null}
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="删除 Run？"
        description={`“${run.title || '未命名 Run'}”删除后无法恢复。`}
        busy={acting}
        onConfirm={() => void remove()}
      />
    </AppPage>
  )
}
