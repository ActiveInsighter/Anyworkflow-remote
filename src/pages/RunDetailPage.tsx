import { BookmarkPlus, BookmarkX, CalendarClock, Copy, Pencil, Pause, Play, RotateCcw, Save, Trash2, XCircle, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  InlineError,
  ListRow,
  LoadingState,
  MetaGrid,
  PageHeader,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusBadge,
} from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useNow } from '@/hooks/useNow'
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
import { describeSchedule } from '@/lib/schedule'
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
  const now = useNow()

  const state = useAsyncData<RunSnapshot>(
    async () => {
      const [run, tasks, favorite] = await Promise.all([
        getRun(runId),
        listAllTasksForRun(runId),
        getRunFavoriteForRun(runId),
      ])
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
      // Carries the stored instant through, so a scheduled draft still fires at its own time.
      await updateRunDraft(run.id, run.planText, { publish: true, scheduledAt: run.scheduledAt })
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  /**
   * Drops a pending boundary and queues right away. Only reachable from `draft`: once a Run is
   * queued its `scheduledAt` is immutable, which is why cancel is the only other way out.
   */
  async function runImmediately() {
    const run = state.data?.run
    if (!run || run.status !== 'draft' || acting) return
    setActing(true)
    setActionError('')
    try {
      await updateRunDraft(run.id, run.planText, { publish: true, scheduledAt: '' })
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

  if (state.loading && !state.data) {
    return <AppPage><LoadingState /></AppPage>
  }
  if (state.error && !state.data) {
    return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  }
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
  const hasPlan = Boolean(run.planText.trim())
  const schedule = describeSchedule(run.scheduledAt, new Date(now))
  /** A boundary only matters while the Run can still be affected by it. */
  const scheduleLive = schedule.pending && (run.status === 'draft' || run.status === 'queued')

  return (
    <AppPage>
      <PageHeader
        eyebrow={<Link to="/" className="outline-none hover:text-foreground focus-visible:underline">工作流</Link>}
        title={run.title || '未命名 Run'}
        actions={
          <>
            {run.status === 'draft' ? (
              <Button variant="outline" asChild>
                <Link to={'/runs/' + run.id + '/edit'}><Pencil />编辑</Link>
              </Button>
            ) : null}
            {run.status === 'draft' ? (
              <Button onClick={() => void publishDraft()} disabled={acting}>
                <Play />{schedule.pending ? '按计划运行' : '运行'}
              </Button>
            ) : null}
            {canPause ? (
              <Button variant="outline" onClick={() => void control('pause')} disabled={acting}><Pause />暂停</Button>
            ) : null}
            {canResume ? (
              <Button onClick={() => void control('resume')} disabled={acting}><Play />继续</Button>
            ) : null}
            {canCancel ? (
              <Button variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消</Button>
            ) : null}
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Panel className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">{progressText(run.completedTasks, totalTasks, 'Tasks')}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">已完成的 Task 数量</div>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <ProgressBar className="mt-3" value={percent} tone={status.tone} />
        <div className="mt-4">
          <MetaGrid
            items={[
              { label: '调度', value: modeLabel(run.executionMode, run.maxConcurrency, '任务') },
              { label: '执行时间', value: schedule.set ? schedule.absolute : '立即' },
              { label: '活跃', value: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length },
              { label: '更新', value: formatDateTime(run.updated) },
              { label: '版本', value: run.commandVersion },
            ]}
          />
        </div>
        {run.lastError ? <div className="mt-4"><InlineError>{run.lastError}</InlineError></div> : null}
      </Panel>

      {scheduleLive ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-info/25 bg-info-soft px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-info">
                已安排在 {schedule.absolute} 执行 · {schedule.relative}
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                {run.status === 'draft'
                  ? '还是草稿：可以直接编辑，或清掉这个时刻立即运行。'
                  : '到点前取消 Run 即可阻止执行；离开草稿后这个时刻不能再改。'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {run.status === 'draft' ? (
              <>
                <Button size="sm" onClick={() => void publishDraft()} disabled={acting}>
                  <Play />按计划运行
                </Button>
                <Button size="sm" variant="outline" onClick={() => void runImmediately()} disabled={acting}>
                  <Zap />立即运行
                </Button>
              </>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => void control('cancel')} disabled={acting}>
                <XCircle />取消执行
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => void toggleFavorite()} disabled={acting}>
          {favorite ? <BookmarkX /> : <BookmarkPlus />}
          {favorite ? '取消收藏' : '收藏'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void saveTemplate()} disabled={acting || !hasPlan}>
          <Save />存模板
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void copy('draft')} disabled={acting || !hasPlan}>
          <Copy />复制
        </Button>
        {terminal ? (
          <Button size="sm" variant="ghost" onClick={() => void copy('queued')} disabled={acting || !hasPlan}>
            <RotateCcw />重跑
          </Button>
        ) : null}
        {run.status === 'draft' || terminal ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={acting}
          >
            <Trash2 />删除
          </Button>
        ) : null}
      </div>

      <SectionHeading title="Tasks" trailing={tasks.length} />

      {tasks.length ? (
        <Panel>
          {tasks.map((task) => {
            const taskStatus = runStatusMeta(task.status, task.requestedAction)
            return (
              <ListRow
                key={task.id}
                className="grid gap-3 sm:grid-cols-[44px_minmax(0,1fr)_170px] sm:items-center sm:gap-5"
                render={<Link to={'/tasks/' + task.id} />}
              >
                <div className="hidden size-9 place-items-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground sm:grid">
                  {String(task.runIndex + 1).padStart(2, '0')}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-[13px] font-medium">
                      {task.title || 'Task ' + (task.runIndex + 1)}
                    </h3>
                    <StatusBadge tone={taskStatus.tone}>{taskStatus.label}</StatusBadge>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {modeLabel(task.executionMode, task.maxConcurrency, '事件')}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {progressText(task.completedEvents, task.totalEvents, 'Events')}
                  </div>
                  <ProgressBar value={progressPercent(task.completedEvents, task.totalEvents)} tone={taskStatus.tone} />
                </div>
              </ListRow>
            )
          })}
        </Panel>
      ) : run.status !== 'draft' ? (
        <EmptyState title="暂无 Task" description="Run 开始执行后，这里会列出拆分出的 Task。" />
      ) : (
        <EmptyState title="草稿尚未运行" description="编辑并运行后即可看到 Task 列表。" />
      )}

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
