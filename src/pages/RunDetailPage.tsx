import {
  BookmarkPlus,
  BookmarkX,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Pencil,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAsyncData, invalidateAsyncDataCache } from '@/hooks/useAsyncData'
import { useNow } from '@/hooks/useNow'
import {
  cloneRun,
  commandRun,
  deleteRun,
  getRun,
  listEventsForTask,
  listTasksForRun,
  toErrorMessage,
  updateRunDraft,
} from '@/lib/api'
import { createRunFavorite, createWorkflowTemplateFromRun, deleteRunFavorite, getRunFavoriteForRun } from '@/lib/library'
import {
  eventProgressLabel,
  eventStatusMeta,
  formatDateTime,
  modeLabel,
  progressPercent,
  progressText,
  runStatusMeta,
} from '@/lib/format'
import { describeSchedule } from '@/lib/schedule'
import type { DispatchEventRecord, DispatchRequestedAction, DispatchRunRecord, DispatchTaskRecord } from '@/types'
import { toast } from 'sonner'

const PAGE_SIZE = 20

function positivePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function eventTitle(event: DispatchEventRecord): string {
  return event.queueTextOverride.match(/^\s*@event\s*=\s*(.*?)\s*$/imu)?.[1]?.trim() || `Event ${event.eventIndex + 1}`
}

function EventNode({ event, deepLinked }: { event: DispatchEventRecord; deepLinked: boolean }) {
  const [open, setOpen] = useState(deepLinked)
  const [contentOpen, setContentOpen] = useState(false)

  useEffect(() => {
    if (deepLinked) setOpen(true)
  }, [deepLinked])

  const status = eventStatusMeta(event.status, event.terminalResult)

  return (
    <div id={'event-' + event.id} className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
          {event.eventIndex + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{eventTitle(event)}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="hidden max-w-[38%] shrink-0 truncate text-[10px] text-muted-foreground sm:block">
          {eventProgressLabel(event.status, event.progress)}
        </span>
      </button>

      {open ? (
        <div className="border-t border-border bg-muted/10 px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {event.attempt > 0 ? <span>尝试 {event.attempt}</span> : null}
            <span>{formatDateTime(event.updated)}</span>
            {event.workerId ? <span className="hidden sm:inline">Worker {event.workerId}</span> : null}
            {event.queueTextOverride.trim() ? (
              <Button
                size="sm"
                variant="link"
                className="h-auto gap-1 p-0 text-[10px] text-info"
                onClick={() => setContentOpen(true)}
              >
                <FileText className="size-3.5" />
                查看执行内容
              </Button>
            ) : null}
          </div>
          {event.lastError ? <div className="mt-2"><InlineError>{event.lastError}</InlineError></div> : null}
        </div>
      ) : null}

      <Dialog open={contentOpen} onOpenChange={setContentOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>执行内容</DialogTitle>
            <DialogDescription>{eventTitle(event)}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/45 p-3 text-[12px] leading-6">
            {event.queueTextOverride}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaskNode({
  task,
  deepTaskId,
  deepEventId,
  deepEventPage,
  activeRun,
}: {
  task: DispatchTaskRecord
  deepTaskId: string
  deepEventId: string
  deepEventPage: number
  activeRun: boolean
}) {
  const deepLinked = task.id === deepTaskId
  const [open, setOpen] = useState(deepLinked)
  const [eventPage, setEventPage] = useState(deepLinked ? deepEventPage : 1)

  useEffect(() => {
    if (!deepLinked) return
    setOpen(true)
    setEventPage(deepEventPage)
  }, [deepLinked, deepEventPage])

  const eventsState = useAsyncData(
    async () => listEventsForTask(task.id, eventPage, PAGE_SIZE),
    [task.id, eventPage],
    {
      enabled: open,
      pollMs: open && activeRun ? 8_000 : undefined,
      staleMs: 8_000,
      cacheKey: open ? 'events:' + task.id + ':' + eventPage : undefined,
      errorMessage: toErrorMessage,
    },
  )

  const status = runStatusMeta(task.status, task.requestedAction)
  const percent = progressPercent(task.completedEvents, task.totalEvents)

  return (
    <div id={'task-' + task.id} className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="hidden size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground sm:grid">
          {task.runIndex + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{task.title || 'Task ' + (task.runIndex + 1)}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {progressText(task.completedEvents, task.totalEvents, 'Events')} · {percent}%
        </span>
      </button>

      {open ? (
        <div className="border-t border-border bg-muted/10">
          {task.compileError ? <div className="px-3 pt-3 sm:px-4"><InlineError>{task.compileError}</InlineError></div> : null}
          {eventsState.loading && !eventsState.data ? <div className="p-3 sm:p-4"><LoadingState label="加载 Event…" /></div> : null}
          {eventsState.error ? <div className="px-3 pt-3 sm:px-4"><InlineError>{eventsState.error}</InlineError></div> : null}
          {eventsState.data?.items.length ? (
            <div className="ms-3 border-s border-border sm:ms-7">
              {eventsState.data.items.map((event) => (
                <EventNode key={event.id} event={event} deepLinked={event.id === deepEventId} />
              ))}
            </div>
          ) : null}
          {eventsState.data && eventsState.data.items.length === 0 ? (
            <div className="px-4 py-5 text-xs text-muted-foreground">暂无 Event</div>
          ) : null}
          {eventsState.data && eventsState.data.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-[11px] text-muted-foreground sm:px-4">
              <span>{eventsState.data.totalItems} 条 · {eventPage}/{eventsState.data.totalPages} 页</span>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={eventPage <= 1} onClick={() => setEventPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft />上一页
                </Button>
                <Button size="sm" variant="ghost" disabled={eventPage >= eventsState.data.totalPages} onClick={() => setEventPage((value) => value + 1)}>
                  下一页<ChevronRight />
                </Button>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
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
    async () => listTasksForRun(runId, taskPage, PAGE_SIZE),
    [runId, taskPage],
    {
      enabled: Boolean(runId && run),
      pollMs: active ? 8_000 : undefined,
      staleMs: 8_000,
      cacheKey: runId ? 'tasks:' + runId + ':' + taskPage : undefined,
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
            {run.status === 'draft' ? <Button variant="secondary" onClick={() => void publishDraft()} disabled={acting}><Play />{schedule.pending ? '按计划运行' : '运行'}</Button> : null}
            {canPause ? <Button variant="outline" onClick={() => void control('pause')} disabled={acting}><Pause />暂停</Button> : null}
            {canResume ? <Button variant="secondary" onClick={() => void control('resume')} disabled={acting}><Play />继续</Button> : null}
            {canCancel ? <Button variant="destructive" onClick={() => void control('cancel')} disabled={acting}><XCircle />取消</Button> : null}
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {tasksState.error ? <ErrorBanner>{tasksState.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Panel className="px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3 overflow-x-auto whitespace-nowrap text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="font-semibold tabular-nums">{progressText(run.completedTasks, totalTasks, 'Tasks')} · {percent}%</span>
          <ProgressBar className="w-20 shrink-0" value={percent} tone={status.tone} />
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <span className="text-muted-foreground">{modeLabel(run.executionMode, run.maxConcurrency, '任务')}</span>
          <span className="text-muted-foreground">{schedule.set ? schedule.absolute : '立即执行'}</span>
          <span className="text-muted-foreground">更新 {formatDateTime(run.updated)}</span>
        </div>
        {run.lastError ? <div className="mt-2"><InlineError>{run.lastError}</InlineError></div> : null}
      </Panel>

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
