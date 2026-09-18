import { BookmarkPlus, BookmarkX, Copy, Pencil, Pause, Play, RotateCcw, Save, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, LoadingState, MetaGrid, PageHeader, ProgressBar, SectionHeading, StatusBadge } from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
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
import { createRunFavorite, createWorkflowTemplateFromRun, deleteRunFavorite, getRunFavoriteForRun } from '@/lib/library'
import { formatDateTime, modeLabel, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import type { DispatchRequestedAction, DispatchRunRecord } from '@/types'

interface RunSnapshot {
  run: DispatchRunRecord
  tasks: Awaited<ReturnType<typeof listAllTasksForRun>>
  favorite: Awaited<ReturnType<typeof getRunFavoriteForRun>>
}

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const navigate = useNavigate()
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const state = useAsyncData<RunSnapshot>(
    async () => {
      const [run, tasks, favorite] = await Promise.all([getRun(runId), listAllTasksForRun(runId), getRunFavoriteForRun(runId)])
      return { run, tasks, favorite }
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
      navigate(status === 'draft' ? '/runs/' + copied.id + '/edit' : '/runs/' + copied.id)
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function toggleFavorite() {
    if (!state.data || acting) return
    const { run, favorite } = state.data
    setActing(true)
    setActionError('')
    try {
      if (favorite) await deleteRunFavorite(favorite.id)
      else await createRunFavorite(run.id)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function saveTemplate() {
    const run = state.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      const template = await createWorkflowTemplateFromRun(run)
      navigate('/templates/' + template.id)
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

  if (state.loading && !state.data) return <AppPage><LoadingState /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data) return null

  const { run, tasks, favorite } = state.data
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
        title={run.title || '未命名 Run'}
        actions={
          <>
            {run.status === 'draft' ? <Button variant="outline" asChild><Link to={'/runs/' + run.id + '/edit'}><Pencil />编辑</Link></Button> : null}
            {run.status === 'draft' ? <Button onClick={() => void publishDraft()} disabled={acting}><Play />运行</Button> : null}
            {canPause ? <Button variant="outline" onClick={() => void control('pause')} disabled={acting}><Pause />暂停</Button> : null}
            {canResume ? <Button onClick={() => void control('resume')} disabled={acting}><Play />继续</Button> : null}
            {canCancel ? <Button variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消</Button> : null}
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold">{progressText(run.completedTasks, totalTasks, 'Tasks')}</div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <ProgressBar className="mt-3" value={percent} tone={status.tone} />
        <div className="mt-4">
          <MetaGrid items={[
            { label: '调度', value: modeLabel(run.executionMode, run.maxConcurrency, '任务') },
            { label: '活跃', value: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length },
            { label: '更新', value: formatDateTime(run.updated) },
            { label: '版本', value: run.commandVersion },
          ]} />
        </div>
        {run.lastError ? <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">{run.lastError}</div> : null}
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-b pb-3">
        <Button size="sm" variant="ghost" onClick={() => void toggleFavorite()} disabled={acting}>
          {favorite ? <BookmarkX /> : <BookmarkPlus />}{favorite ? '取消收藏' : '收藏'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void saveTemplate()} disabled={acting || !run.planText.trim()}>
          <Save />存模板
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void copy('draft')} disabled={acting || !run.planText.trim()}>
          <Copy />复制
        </Button>
        {terminal ? (
          <Button size="sm" variant="ghost" onClick={() => void copy('queued')} disabled={acting || !run.planText.trim()}>
            <RotateCcw />重跑
          </Button>
        ) : null}
        {(run.status === 'draft' || terminal) ? (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteOpen(true)} disabled={acting}>
            <Trash2 />删除
          </Button>
        ) : null}
      </div>

      <SectionHeading title="Tasks" trailing={tasks.length} />

      {tasks.length ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          {tasks.map((task) => {
            const taskStatus = runStatusMeta(task.status, task.requestedAction)
            return (
              <Link
                className="grid gap-3 border-b p-4 last:border-b-0 hover:bg-muted/20 sm:grid-cols-[44px_minmax(0,1fr)_180px] sm:items-center"
                to={'/tasks/' + task.id}
                key={task.id}
              >
                <div className="hidden size-9 place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground sm:grid">
                  {String(task.runIndex + 1).padStart(2, '0')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{task.title || 'Task ' + (task.runIndex + 1)}</h3>
                    <StatusBadge tone={taskStatus.tone}>{taskStatus.label}</StatusBadge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {modeLabel(task.executionMode, task.maxConcurrency, '事件')}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] text-muted-foreground">
                    {progressText(task.completedEvents, task.totalEvents, 'Events')}
                  </div>
                  <ProgressBar value={progressPercent(task.completedEvents, task.totalEvents)} tone={taskStatus.tone} />
                </div>
              </Link>
            )
          })}
        </div>
      ) : run.status !== 'draft' ? <EmptyState title="暂无 Task" /> : null}

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="删除 Run？"
        description={run.title || '未命名 Run'}
        busy={acting}
        onConfirm={() => void remove()}
      />
    </AppPage>
  )
}
