import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, Card, ErrorBanner, LoadingState, MetaGrid, PageHeader, ProgressBar, StatusBadge } from '../components/ui'
import {
  cloneRun,
  commandRun,
  deleteRun,
  getRun,
  listAllTasksForRun,
  toErrorMessage,
  updateRunDraft,
} from '../lib/api'
import { formatDateTime, modeLabel, progressPercent, progressText, runStatusMeta } from '../lib/format'
import { useAsyncData } from '../hooks/useAsyncData'
import type { DispatchRequestedAction, DispatchRunRecord } from '../types'

interface RunSnapshot {
  run: DispatchRunRecord
  tasks: Awaited<ReturnType<typeof listAllTasksForRun>>
}

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const navigate = useNavigate()
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')

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
    if (!window.confirm(`确定删除“${run.title || '未命名 Run'}”吗？`)) return
    setActing(true)
    setActionError('')
    try {
      await deleteRun(run)
      navigate('/')
    } catch (error) {
      setActionError(toErrorMessage(error))
      setActing(false)
    }
  }

  if (state.loading && !state.data) return <LoadingState label="正在读取 Run…" />
  if (state.error && !state.data) return <ErrorBanner>{state.error}</ErrorBanner>
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
    <>
      <PageHeader
        eyebrow="Run"
        title={run.title || '未命名 Run'}
        description={modeLabel(run.executionMode, run.maxConcurrency, '任务')}
        actions={
          <>
            {run.status === 'draft' ? <Button variant="secondary" asChild><Link to={`/runs/${run.id}/edit`}>编辑</Link></Button> : null}
            {run.status === 'draft' ? <Button variant="primary" onClick={() => void publishDraft()} disabled={acting}>开始运行</Button> : null}
            {canPause ? <Button variant="secondary" onClick={() => void control('pause')} disabled={acting}>暂停</Button> : null}
            {canResume ? <Button variant="primary" onClick={() => void control('resume')} disabled={acting}>继续</Button> : null}
            {canCancel ? <Button variant="danger" onClick={() => void control('cancel')} disabled={acting}>取消</Button> : null}
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Card className="summary-card">
        <div className="summary-top">
          <div>
            <span className="eyebrow">执行概览</span>
            <h2>{progressText(run.completedTasks, totalTasks, 'Tasks')}</h2>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <ProgressBar value={percent} tone={status.tone} />
        <MetaGrid items={[
          { label: '调度方式', value: modeLabel(run.executionMode, run.maxConcurrency, '任务') },
          { label: '活跃任务', value: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length },
          { label: '更新时间', value: formatDateTime(run.updated) },
          { label: '命令版本', value: run.commandVersion },
        ]} />
        {run.lastError ? <div className="inline-error">{run.lastError}</div> : null}
      </Card>

      <div className="section-bar">
        <div>
          <span className="eyebrow">Tasks</span>
          <h2>任务组</h2>
        </div>
        <span>{tasks.length} 项</span>
      </div>

      <div className="detail-list">
        {tasks.map((task) => {
          const taskStatus = runStatusMeta(task.status, task.requestedAction)
          return (
            <Link className="detail-row card" to={`/tasks/${task.id}`} key={task.id}>
              <div className="detail-index">{String(task.runIndex + 1).padStart(2, '0')}</div>
              <div className="detail-main">
                <div className="detail-title-row">
                  <h3>{task.title || `Task ${task.runIndex + 1}`}</h3>
                  <StatusBadge tone={taskStatus.tone}>{taskStatus.label}</StatusBadge>
                </div>
                <p>{modeLabel(task.executionMode, task.maxConcurrency, '事件')} · {progressText(task.completedEvents, task.totalEvents, 'Events')}</p>
                <ProgressBar value={progressPercent(task.completedEvents, task.totalEvents)} tone={taskStatus.tone} />
              </div>
              <span className="detail-arrow">›</span>
            </Link>
          )
        })}
      </div>

      {!tasks.length && run.status !== 'draft' ? (
        <Card className="soft-card">云端正在编排 Task，页面会自动刷新。</Card>
      ) : null}

      <Card className="danger-zone">
        <div>
          <span className="eyebrow">更多操作</span>
          <h2>复制与清理</h2>
          <p>复制只复用工作流定义，不复制运行时状态。</p>
        </div>
        <div className="danger-actions">
          <Button variant="secondary" onClick={() => void copy('draft')} disabled={acting || !run.planText.trim()}>复制为草稿</Button>
          {terminal ? <Button variant="secondary" onClick={() => void copy('queued')} disabled={acting || !run.planText.trim()}>重新运行</Button> : null}
          {(run.status === 'draft' || terminal) ? <Button variant="danger" onClick={() => void remove()} disabled={acting}>删除 Run</Button> : null}
        </div>
      </Card>
    </>
  )
}
