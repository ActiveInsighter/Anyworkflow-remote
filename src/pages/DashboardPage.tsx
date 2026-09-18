import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { cloneRun, deleteRun, listAllRuns, toErrorMessage } from '../lib/api'
import { formatDateTime, modeLabel, progressPercent, progressText, runStatusMeta } from '../lib/format'
import { useSession } from '../lib/session'
import { useAsyncData } from '../hooks/useAsyncData'
import type { DispatchRunRecord } from '../types'
import { Button, EmptyState, ErrorBanner, LoadingState, PageHeader, ProgressBar, StatusBadge } from '../components/ui'

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

  async function removeRun(run: DispatchRunRecord) {
    if (!window.confirm(`确定删除“${run.title || '未命名 Run'}”吗？删除后无法恢复。`)) return
    setActingId(run.id)
    setActionError('')
    try {
      await deleteRun(run)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setActingId('')
    }
  }

  if (!session) {
    return (
      <>
        <PageHeader
          eyebrow="AnyWorkflow Remote"
          title="远程工作流控制台"
          description="使用同一套 AnyWorkflow 后端，在电脑和手机浏览器中管理 Run、Task 与 Event。"
        />
        <EmptyState
          title="还没有连接 AnyWorkflow"
          description="连接现有 PocketBase 账号后即可读取你的小程序工作流，不需要修改后端。"
          action={<Button variant="primary" asChild><Link to="/settings">连接账号</Link></Button>}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="工作流"
        title="我的 Run"
        description="查看草稿、正在运行和已结束的工作流。进行中的数据会自动刷新。"
        actions={
          <>
            <Button variant="secondary" onClick={() => void state.reload()} disabled={state.loading}>刷新</Button>
            <Button variant="primary" asChild><Link to="/runs/new">新建 Run</Link></Button>
          </>
        }
      />

      <section className="stats-grid" aria-label="Run 状态统计">
        <button className={filter === 'all' ? 'stat-card active' : 'stat-card'} onClick={() => setFilter('all')}>
          <span>全部</span><strong>{counts.all}</strong>
        </button>
        <button className={filter === 'draft' ? 'stat-card active' : 'stat-card'} onClick={() => setFilter('draft')}>
          <span>草稿</span><strong>{counts.draft}</strong>
        </button>
        <button className={filter === 'active' ? 'stat-card active' : 'stat-card'} onClick={() => setFilter('active')}>
          <span>进行中</span><strong>{counts.active}</strong>
        </button>
        <button className={filter === 'done' ? 'stat-card active' : 'stat-card'} onClick={() => setFilter('done')}>
          <span>已结束</span><strong>{counts.done}</strong>
        </button>
      </section>

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
      {state.loading && !state.data ? <LoadingState label="正在同步 Run…" /> : null}

      <div className="run-grid">
        {visibleRuns.map((run) => {
          const status = runStatusMeta(run.status, run.requestedAction)
          const percent = progressPercent(run.completedTasks, run.totalTasks)
          const terminal = ['succeeded', 'failed', 'canceled'].includes(run.status)
          const canDelete = run.status === 'draft' || terminal

          return (
            <article className="run-card card" key={run.id}>
              <button className="run-card-main" onClick={() => navigate(`/runs/${run.id}`)}>
                <div className="run-card-head">
                  <div>
                    <h2>{run.title || '未命名 Run'}</h2>
                    <p>{run.status === 'draft' ? '尚未发布' : `${run.totalTasks} 个任务组`} · {modeLabel(run.executionMode, run.maxConcurrency, '任务')}</p>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
                <ProgressBar value={percent} tone={status.tone} />
                <div className="run-card-meta">
                  <span>{progressText(run.completedTasks, run.totalTasks, 'Tasks')}</span>
                  <span>{formatDateTime(run.updated)}</span>
                </div>
              </button>

              <div className="run-card-actions">
                {run.status === 'draft' ? (
                  <Button variant="ghost" onClick={() => navigate(`/runs/${run.id}/edit`)}>编辑</Button>
                ) : null}
                <Button variant="ghost" onClick={() => void copyRun(run, 'draft')} disabled={Boolean(actingId) || !run.planText.trim()}>
                  复制
                </Button>
                {terminal ? (
                  <Button variant="ghost" onClick={() => void copyRun(run, 'queued')} disabled={Boolean(actingId) || !run.planText.trim()}>
                    重跑
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button variant="ghost" onClick={() => void removeRun(run)} disabled={Boolean(actingId)}>删除</Button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {!state.loading && visibleRuns.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? '从第一个工作流开始' : '这个分类暂时没有 Run'}
          description={filter === 'all' ? '创建草稿后，可在网页或小程序继续编辑和发布。' : undefined}
          action={filter === 'all' ? <Button variant="primary" asChild><Link to="/runs/new">新建 Run</Link></Button> : undefined}
        />
      ) : null}
    </>
  )
}
