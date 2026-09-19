import { BookmarkPlus, BookmarkX, CalendarClock, Copy, Pencil, Pause, Play, RotateCcw, Save, Trash2, XCircle, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  InlineError,
  LoadingState,
  MetaGrid,
  PageHeader,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusBadge,
} from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { RunHierarchy } from '@/components/app/RunHierarchy'
import { Button } from '@/components/ui/button'
import { invalidateAsyncDataCache, useAsyncData } from '@/hooks/useAsyncData'
import { useNow } from '@/hooks/useNow'
import {
  cloneRun,
  commandRun,
  deleteRun,
  getRun,
  listTasksForRun,
  toErrorMessage,
  updateRunDraft,
} from '@/lib/api'
import { createRunFavorite, createWorkflowTemplateFromRun, deleteRunFavorite, getRunFavoriteForRun } from '@/lib/library'
import { formatDateTime, modeLabel, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import { describeSchedule } from '@/lib/schedule'
import type { DispatchRequestedAction, DispatchRunRecord } from '@/types'

const TASK_PAGE_SIZE = 20

interface RunInfo {
  run: DispatchRunRecord
  favorite: Awaited<ReturnType<typeof getRunFavoriteForRun>>
}

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const navigate = useNavigate()
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [taskPage, setTaskPage] = useState(1)
  const now = useNow()

  const runState = useAsyncData<RunInfo>(
    async () => {
      const [run, favorite] = await Promise.all([getRun(runId), getRunFavoriteForRun(runId)])
      return { run, favorite }
    },
    [runId],
    {
      enabled: Boolean(runId),
      pollMs: 8000,
      staleMs: 6000,
      cacheKey: `run:${runId}:info`,
      errorMessage: toErrorMessage,
    },
  )

  const live = runState.data?.run.status === 'queued' || runState.data?.run.status === 'running'
  const tasksState = useAsyncData(
    async () => listTasksForRun(runId, taskPage, TASK_PAGE_SIZE),
    [runId, taskPage],
    {
      enabled: Boolean(runId),
      pollMs: live ? 10000 : undefined,
      staleMs: 12000,
      cacheKey: `tasks:${runId}:page-${taskPage}`,
      errorMessage: toErrorMessage,
    },
  )

  function invalidateRunCaches() {
    invalidateAsyncDataCache(`run:${runId}:`)
    invalidateAsyncDataCache(`tasks:${runId}:`)
    const owner = runState.data?.run.owner
    if (owner) invalidateAsyncDataCache(`runs:${owner}:`)
  }

  async function refreshAfterMutation() {
    invalidateRunCaches()
    await Promise.all([runState.reload(), tasksState.reload()])
  }

  async function control(action: Exclude<DispatchRequestedAction, 'none'>) {
    const run = runState.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      await commandRun(run, action)
      await refreshAfterMutation()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function publishDraft() {
    const run = runState.data?.run
    if (!run || run.status !== 'draft' || acting) return
    setActing(true)
    setActionError('')
    try {
      await updateRunDraft(run.id, run.planText, { publish: true, scheduledAt: run.scheduledAt })
      await refreshAfterMutation()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function runImmediately() {
    const run = runState.data?.run
    if (!run || run.status !== 'draft' || acting) return
    setActing(true)
    setActionError('')
    try {
      await updateRunDraft(run.id, run.planText, { publish: true, scheduledAt: '' })
      await refreshAfterMutation()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function copy(status: 'draft' | 'queued') {
    const run = runState.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      const copied = await cloneRun(run, status)
      invalidateAsyncDataCache(`runs:${run.owner}:`)
      navigate(status === 'draft' ? `/runs/${copied.id}/edit` : `/runs/${copied.id}`)
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function toggleFavorite() {
    if (!runState.data || acting) return
    const { run, favorite } = runState.data
    setActing(true)
    setActionError('')
    try {
      if (favorite) await deleteRunFavorite(favorite.id)
      else await createRunFavorite(run.id)
      invalidateAsyncDataCache(`run:${runId}:`)
      await runState.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function saveTemplate() {
    const run = runState.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      const template = await createWorkflowTemplateFromRun(run)
      navigate(`/templates/${template.id}`)
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  async function remove() {
    const run = runState.data?.run
    if (!run || acting) return
    setActing(true)
    setActionError('')
    try {
      await deleteRun(run)
      invalidateAsyncDataCache(`runs:${run.owner}:`)
      invalidateAsyncDataCache(`run:${run.id}:`)
      invalidateAsyncDataCache(`tasks:${run.id}:`)
      setConfirmDeleteOpen(false)
      navigate('/')
    } catch (error) {
      setActionError(toErrorMessage(error))
      setActing(false)
    }
  }

  if (runState.loading && !runState.data) return <AppPage><LoadingState /></AppPage>
  if (runState.error && !runState.data) return <AppPage><ErrorBanner>{runState.error}</ErrorBanner></AppPage>
  if (!runState.data) return null

  const { run, favorite } = runState.data
  const tasksPage = tasksState.data
  const tasks = tasksPage?.items || []
  const status = runStatusMeta(run.status, run.requestedAction)
  const totalTasks = Math.max(run.totalTasks, tasksPage?.totalItems || 0)
  const percent = progressPercent(run.completedTasks, totalTasks)
  const active = run.status === 'queued' || run.status === 'running'
  const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
  const canPause = active && run.requestedAction === 'none'
  const canResume = active && run.requestedAction === 'pause'
  const canCancel = active && run.requestedAction !== 'cancel'
  const hasPlan = Boolean(run.planText.trim())
  const schedule = describeSchedule(run.scheduledAt, new Date(now))
  const scheduleLive = schedule.pending && (run.status === 'draft' || run.status === 'queued')

  return (
    <AppPage>
      <PageHeader
        title={run.title || '未命名 Run'}
        actions={
          <>
            {run.status === 'draft' ? (
              <Button variant="outline" asChild><Link to={`/runs/${run.id}/edit`}><Pencil />编辑</Link></Button>
            ) : null}
            {run.status === 'draft' ? (
              <Button onClick={() => void publishDraft()} disabled={acting}><Play />{schedule.pending ? '按计划运行' : '运行'}</Button>
            ) : null}
            {canPause ? <Button variant="outline" onClick={() => void control('pause')} disabled={acting}><Pause />暂停</Button> : null}
            {canResume ? <Button onClick={() => void control('resume')} disabled={acting}><Play />继续</Button> : null}
            {canCancel ? <Button variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消</Button> : null}
          </>
        }
      />

      {runState.error ? <ErrorBanner>{runState.error}</ErrorBanner> : null}
      {tasksState.error ? <ErrorBanner>{tasksState.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Panel className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 text-[13px] font-semibold">{progressText(run.completedTasks, totalTasks, 'Tasks')}</div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <ProgressBar className="mt-3" value={percent} tone={status.tone} />
        <div className="mt-4">
          <MetaGrid
            items={[
              { label: '调度', value: modeLabel(run.executionMode, run.maxConcurrency, '任务') },
              { label: '执行时间', value: schedule.set ? schedule.absolute : '立即' },
              { label: '更新', value: formatDateTime(run.updated) },
              { label: '版本', value: run.commandVersion },
            ]}
          />
        </div>
        {run.lastError ? <div className="mt-4"><InlineError>{run.lastError}</InlineError></div> : null}
      </Panel>

      {scheduleLive ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-info/25 bg-info-soft px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium text-info">
            <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{schedule.absolute} · {schedule.relative}</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {run.status === 'draft' ? (
              <>
                <Button size="sm" onClick={() => void publishDraft()} disabled={acting}><Play />按计划运行</Button>
                <Button size="sm" variant="outline" onClick={() => void runImmediately()} disabled={acting}><Zap />立即运行</Button>
              </>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消执行</Button>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => void toggleFavorite()} disabled={acting}>
          {favorite ? <BookmarkX /> : <BookmarkPlus />}{favorite ? '取消收藏' : '收藏'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void saveTemplate()} disabled={acting || !hasPlan}><Save />存模板</Button>
        <Button size="sm" variant="ghost" onClick={() => void copy('draft')} disabled={acting || !hasPlan}><Copy />复制</Button>
        {terminal ? <Button size="sm" variant="ghost" onClick={() => void copy('queued')} disabled={acting || !hasPlan}><RotateCcw />重跑</Button> : null}
        {run.status === 'draft' || terminal ? (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteOpen(true)} disabled={acting}>
            <Trash2 />删除
          </Button>
        ) : null}
      </div>

      <SectionHeading title="Task / Event / Act" trailing={tasksPage ? `${tasksPage.totalItems}` : undefined} />

      {tasksState.loading && !tasksPage ? <LoadingState /> : tasks.length && tasksPage ? (
        <RunHierarchy
          tasks={tasks}
          totalItems={tasksPage.totalItems}
          live={active}
          page={tasksPage.page}
          totalPages={tasksPage.totalPages}
          onPageChange={setTaskPage}
        />
      ) : tasksPage && run.status !== 'draft' ? (
        <EmptyState title="暂无 Task" />
      ) : tasksPage ? (
        <EmptyState title="草稿尚未运行" />
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
