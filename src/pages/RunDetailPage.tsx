import {
  BookmarkPlus,
  BookmarkX,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Pencil,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  InlineError,
  LoadingState,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
} from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { TaskNode } from '@/components/run/RunTaskNode'
import { RUN_DETAIL_PAGE_SIZE } from '@/components/run/run-detail-constants'
import { Button } from '@/components/ui/button'
import { useAsyncData, invalidateAsyncDataCache } from '@/hooks/useAsyncData'
import { useNow } from '@/hooks/useNow'
import {
  cloneRun,
  commandRun,
  deleteRun,
  getRun,
  listTasksForRun,
  listRunVersions,
  resumeFailedRun,
  toErrorMessage,
  updateRunDraft,
} from '@/lib/api'
import { createRunFavorite, createWorkflowTemplateFromRun, deleteRunFavorite, getRunFavoriteForRun } from '@/lib/library'
import {
  formatDateTime,
  modeLabel,
  progressPercent,
  progressText,
  runStatusMeta,
} from '@/lib/format'
import { describeSchedule } from '@/lib/schedule'
import type { DispatchRequestedAction } from '@/types'
import { toast } from 'sonner'

function positivePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const now = useNow()

  const taskPage = positivePage(searchParams.get('taskPage'))
  const deepTaskId = searchParams.get('task') || ''
  const deepEventId = searchParams.get('event') || ''
  const deepEventPage = positivePage(searchParams.get('eventPage'))

  const state = useAsyncData(
    async () => {
      const [run, favorite] = await Promise.all([getRun(runId), getRunFavoriteForRun(runId)])
      return { run, favorite }
    },
    [runId],
    {
      enabled: Boolean(runId),
      pollMs: 8_000,
      staleMs: 8_000,
      cacheKey: runId ? 'run:' + runId : undefined,
      errorMessage: toErrorMessage,
    },
  )

  const run = state.data?.run
  const active = run?.status === 'queued' || run?.status === 'running'

  const tasksState = useAsyncData(
    async () => listTasksForRun(runId, taskPage, RUN_DETAIL_PAGE_SIZE),
    [runId, taskPage],
    {
      enabled: Boolean(runId && run),
      pollMs: active ? 8_000 : undefined,
      staleMs: 8_000,
      cacheKey: runId ? 'tasks:' + runId + ':' + taskPage : undefined,
      errorMessage: toErrorMessage,
    },
  )

  const versionsState = useAsyncData(
    async () => listRunVersions(run?.familyId || runId),
    [run?.familyId, runId],
    {
      enabled: Boolean(run),
      staleMs: 30_000,
      cacheKey: run ? 'run-family:' + run.familyId : undefined,
      errorMessage: toErrorMessage,
    },
  )

  function setTaskPage(next: number) {
    const params = new URLSearchParams(searchParams)
    if (next <= 1) params.delete('taskPage')
    else params.set('taskPage', String(next))
    params.delete('task')
    params.delete('event')
    params.delete('eventPage')
    setSearchParams(params)
  }

  async function control(action: Exclude<DispatchRequestedAction, 'none'>) {
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      await commandRun(run, action)
      invalidateAsyncDataCache('run:' + run.id)
      invalidateAsyncDataCache('tasks:' + run.id + ':')
      await state.reload()
      await tasksState.reload()
      toast.success(action === 'pause' ? '已请求暂停' : action === 'resume' ? '已请求继续' : '已请求取消')
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('操作失败', { description: message })
    } finally {
      setActing(false)
    }
  }

  async function publishDraft() {
    if (!run || run.status !== 'draft' || acting) return
    setActing(true)
    setActionError('')
    try {
      await updateRunDraft(run.id, run.planText, { publish: true, scheduledAt: run.scheduledAt })
      invalidateAsyncDataCache('run:' + run.id)
      invalidateAsyncDataCache('runs:')
      await state.reload()
      toast.success(run.scheduledAt ? '已按计划提交执行' : '已提交执行')
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('提交失败', { description: message })
    } finally {
      setActing(false)
    }
  }

  async function runImmediately() {
    if (!run || run.status !== 'draft' || acting) return
    setActing(true)
    setActionError('')
    try {
      await updateRunDraft(run.id, run.planText, { publish: true, scheduledAt: '' })
      invalidateAsyncDataCache('run:' + run.id)
      invalidateAsyncDataCache('runs:')
      await state.reload()
      toast.success('已立即提交执行')
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('提交失败', { description: message })
    } finally {
      setActing(false)
    }
  }

  async function copy(status: 'draft' | 'queued') {
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      const copied = await cloneRun(run, status)
      invalidateAsyncDataCache('runs:')
      toast.success(status === 'draft' ? '已复制为草稿' : '已创建重跑')
      navigate(status === 'draft' ? '/runs/' + copied.id + '/edit' : '/runs/' + copied.id)
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('复制失败', { description: message })
    } finally {
      setActing(false)
    }
  }

  async function resumeFromCheckpoint() {
    if (!run || run.status !== 'failed' || acting) return
    setActing(true)
    setActionError('')
    try {
      const resumed = await resumeFailedRun(run)
      invalidateAsyncDataCache('runs:')
      invalidateAsyncDataCache('run-family:' + run.familyId)
      toast.success('已创建检查点恢复版本')
      navigate('/runs/' + resumed.id)
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('无法恢复此 Run', { description: message })
    } finally {
      setActing(false)
    }
  }

  async function toggleFavorite() {
    if (!state.data || acting) return
    setActing(true)
    setActionError('')
    try {
      if (state.data.favorite) await deleteRunFavorite(state.data.favorite.id)
      else await createRunFavorite(state.data.run.id)
      invalidateAsyncDataCache('run:' + state.data.run.id)
      await state.reload()
      toast.success(state.data.favorite ? '已取消收藏' : '已收藏')
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('收藏操作失败', { description: message })
    } finally {
      setActing(false)
    }
  }

  async function saveTemplate() {
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      const template = await createWorkflowTemplateFromRun(run)
      toast.success('已保存为模板')
      navigate('/templates/' + template.id)
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('保存模板失败', { description: message })
    } finally {
      setActing(false)
    }
  }

  async function remove() {
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      await deleteRun(run)
      invalidateAsyncDataCache('run:' + run.id)
      invalidateAsyncDataCache('runs:')
      setConfirmDeleteOpen(false)
      toast.success('Run 已删除')
      navigate('/')
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('删除失败', { description: message })
      setActing(false)
    }
  }

  if (state.loading && !state.data) return <AppPage><LoadingState /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data || !run) return null

  const favorite = state.data.favorite
  const status = runStatusMeta(run.status, run.requestedAction)
  const totalTasks = Math.max(run.totalTasks, tasksState.data?.totalItems || 0)
  const percent = progressPercent(run.completedTasks, totalTasks)
  const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
  const canPause = active && run.requestedAction === 'none'
  const canResume = active && run.requestedAction === 'pause'
  const canCancel = active && run.requestedAction !== 'cancel'
  const hasPlan = Boolean(run.planText.trim())
  const schedule = describeSchedule(run.scheduledAt, new Date(now))
  const scheduleLive = schedule.pending && (run.status === 'draft' || run.status === 'queued')

  return (
    <AppPage className="max-w-[1280px]">
      <PageHeader
        title={run.title || '未命名 Run'}
        actions={
          <>
            {run.status === 'draft' ? <Button variant="outline" asChild><Link to={'/runs/' + run.id + '/edit'}><Pencil />编辑</Link></Button> : null}
            {run.status === 'draft' ? <Button variant="secondary" onClick={() => void (schedule.pending ? publishDraft() : runImmediately())} disabled={acting}><Play />{schedule.pending ? '按计划运行' : '运行'}</Button> : null}
            {canPause ? <Button variant="outline" onClick={() => void control('pause')} disabled={acting}><Pause />暂停</Button> : null}
            {canResume ? <Button variant="secondary" onClick={() => void control('resume')} disabled={acting}><Play />继续</Button> : null}
            {run.status === 'failed' ? <Button variant="secondary" onClick={() => void resumeFromCheckpoint()} disabled={acting}><RotateCcw />从检查点恢复</Button> : null}
            {canCancel ? <Button variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消</Button> : null}
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {tasksState.error ? <ErrorBanner>{tasksState.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Panel className="px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
          <span className="font-semibold tabular-nums">{progressText(run.completedTasks, totalTasks, 'Tasks')} · {percent}%</span>
          <ProgressBar className="w-20 shrink-0" value={percent} tone={status.tone} />
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <span className="inline-flex items-center gap-1 text-muted-foreground"><GitBranch className="size-3" />v{run.versionNumber} · {run.origin === 'resume' ? '恢复' : run.origin === 'rerun' ? '重跑' : run.origin === 'edited_rerun' ? '编辑副本' : '初始'}</span>
          <span className="text-muted-foreground">{modeLabel(run.executionMode, run.maxConcurrency, '任务')}</span>
          <span className="text-muted-foreground">{schedule.set ? schedule.absolute : '立即执行'}</span>
          <span className="text-muted-foreground">更新 {formatDateTime(run.updated)}</span>
        </div>
        {run.lastError ? <div className="mt-2"><InlineError>{run.lastError}</InlineError></div> : null}
      </Panel>

      {versionsState.data?.length && versionsState.data.length > 1 ? (
        <Panel className="mt-2 px-3 py-2.5 sm:px-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><GitBranch className="size-3.5" />Run 版本</div>
          <div className="flex flex-wrap gap-2">
            {versionsState.data.map((version) => (
              <Link
                key={version.id}
                to={'/runs/' + version.id}
                aria-current={version.id === run.id ? 'page' : undefined}
                className={'rounded-md border px-2.5 py-1.5 text-xs transition-colors ' +
                  (version.id === run.id ? 'border-primary/40 bg-primary/5 font-medium' : 'border-border hover:bg-muted')}
              >
                v{version.versionNumber} · {version.title || '未命名 Run'}
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}

      {scheduleLive ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/25 bg-info-soft px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-xs text-info">
            <CalendarClock className="size-4 shrink-0" />
            <span className="truncate">{schedule.absolute} · {schedule.relative}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {run.status === 'draft' ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => void publishDraft()} disabled={acting}><Play />按计划运行</Button>
                <Button size="sm" variant="outline" onClick={() => void runImmediately()} disabled={acting}><Zap />立即运行</Button>
              </>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消执行</Button>
            )}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => void toggleFavorite()} disabled={acting}>{favorite ? <BookmarkX /> : <BookmarkPlus />}{favorite ? '取消收藏' : '收藏'}</Button>
        <Button size="sm" variant="ghost" onClick={() => void saveTemplate()} disabled={acting || !hasPlan}><Save />存模板</Button>
        <Button size="sm" variant="ghost" onClick={() => void copy('draft')} disabled={acting || !hasPlan}><Copy />复制</Button>
        {terminal ? <Button size="sm" variant="ghost" onClick={() => void copy('queued')} disabled={acting || !hasPlan}><RotateCcw />重跑</Button> : null}
        {run.status === 'draft' || terminal ? <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteOpen(true)} disabled={acting}><Trash2 />删除</Button> : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold">执行结构</h2>
        {tasksState.data ? <span className="text-[11px] tabular-nums text-muted-foreground">{tasksState.data.totalItems} Tasks</span> : null}
      </div>

      {tasksState.loading && !tasksState.data ? <div className="mt-2"><LoadingState label="加载 Task…" /></div> : null}
      {tasksState.data?.items.length ? (
        <Panel className="mt-2">
          {tasksState.data.items.map((task) => (
            <TaskNode
              key={task.id}
              task={task}
              deepTaskId={deepTaskId}
              deepEventId={deepEventId}
              deepEventPage={deepEventPage}
              activeRun={Boolean(active)}
            />
          ))}
        </Panel>
      ) : null}

      {tasksState.data && tasksState.data.items.length === 0 ? (
        <EmptyState className="mt-2" title={run.status === 'draft' ? '草稿尚未运行' : '暂无 Task'} />
      ) : null}

      {tasksState.data && tasksState.data.totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{tasksState.data.totalItems} 条 · {taskPage}/{tasksState.data.totalPages} 页</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={taskPage <= 1} onClick={() => setTaskPage(taskPage - 1)}><ChevronLeft />上一页</Button>
            <Button size="sm" variant="ghost" disabled={taskPage >= tasksState.data.totalPages} onClick={() => setTaskPage(taskPage + 1)}>下一页<ChevronRight /></Button>
          </div>
        </div>
      ) : null}

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
