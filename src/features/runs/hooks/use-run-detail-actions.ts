import { useNavigate } from 'react-router'
import { useAsyncAction } from '@/hooks/use-async-action'
import { cloneRun, commandRun, deleteRun, resumeFailedRun, updateRunDraft } from '@/lib/api'
import { createRunFavorite, createWorkflowTemplateFromRun, deleteRunFavorite } from '@/lib/api/library'
import { nextDailyInstant } from '@/lib/domain/recurrence'
import type { DispatchRequestedAction, DispatchRunRecord, RunFavoriteRecord } from '@/types'
import { invalidateRuns } from '../lib/query-keys'

const COMMAND_SUCCESS: Record<Exclude<DispatchRequestedAction, 'none'>, string> = {
  pause: '已请求暂停',
  resume: '已请求继续',
  cancel: '已请求取消',
}

/**
 * Every write the Run detail view can issue. One action runs at a time; each invalidates exactly
 * the cached reads it affects and then refreshes the view.
 */
export function useRunDetailActions({
  run,
  favorite,
  reload,
  selectVersion,
}: {
  run: DispatchRunRecord | null
  favorite: RunFavoriteRecord | null
  reload: () => Promise<void>
  selectVersion: (runId: string) => void
}) {
  const navigate = useNavigate()
  const action = useAsyncAction()

  function command(requested: Exclude<DispatchRequestedAction, 'none'>) {
    if (!run) return
    void action.run(
      requested,
      async () => {
        await commandRun(run, requested)
        invalidateRuns({ runId: run.id, tasksOf: run.id })
        await reload()
      },
      { success: COMMAND_SUCCESS[requested] },
    )
  }

  /** Submit a draft. `immediate` drops any schedule; otherwise the draft keeps its timing. */
  function publish(immediate: boolean) {
    if (!run || run.status !== 'draft') return
    const options = immediate
      ? { publish: true, scheduledAt: '', recurrence: null }
      : { publish: true, scheduledAt: run.recurrence ? nextDailyInstant(run.recurrence) : run.scheduledAt }
    void action.run(
      'publish',
      async () => {
        await updateRunDraft(run.id, run.planText, options)
        invalidateRuns({ runId: run.id, lists: true })
        await reload()
      },
      {
        success: immediate ? '已立即提交执行' : run.scheduledAt ? '已按计划提交执行' : '已提交执行',
        failure: '提交失败',
      },
    )
  }

  function copy(status: 'draft' | 'queued') {
    if (!run) return
    void action.run(
      `copy-${status}`,
      async () => {
        const copied = await cloneRun(run, status)
        invalidateRuns({ lists: true })
        if (status === 'draft') {
          navigate(`/runs/${copied.id}/edit`)
        } else {
          invalidateRuns({ familyId: run.familyId })
          selectVersion(copied.id)
        }
      },
      { success: status === 'draft' ? '已复制为草稿' : '已创建重跑', failure: '复制失败' },
    )
  }

  function resumeFromCheckpoint() {
    if (!run || run.status !== 'failed') return
    void action.run(
      'resume-checkpoint',
      async () => {
        const resumed = await resumeFailedRun(run)
        invalidateRuns({ lists: true, familyId: run.familyId })
        selectVersion(resumed.id)
      },
      { success: '已创建检查点恢复版本', failure: '无法恢复此 Run' },
    )
  }

  function toggleFavorite() {
    if (!run) return
    void action.run(
      'favorite',
      async () => {
        if (favorite) await deleteRunFavorite(favorite.id)
        else await createRunFavorite(run.id)
        invalidateRuns({ runId: run.id })
        await reload()
      },
      { success: favorite ? '已取消收藏' : '已收藏', failure: '收藏操作失败' },
    )
  }

  function saveTemplate() {
    if (!run) return
    void action.run(
      'template',
      async () => {
        const template = await createWorkflowTemplateFromRun(run)
        navigate(`/templates/${template.id}`)
      },
      { success: '已保存为模板', failure: '保存模板失败' },
    )
  }

  async function remove(): Promise<boolean> {
    if (!run) return false
    const done = await action.run(
      'delete',
      async () => {
        await deleteRun(run)
        invalidateRuns({ runId: run.id, lists: true })
        return true
      },
      { success: 'Run 已删除', failure: '删除失败' },
    )
    if (done) navigate('/')
    return Boolean(done)
  }

  return {
    busy: action.busy,
    pending: action.pending,
    error: action.error,
    command,
    publish,
    copy,
    resumeFromCheckpoint,
    toggleFavorite,
    saveTemplate,
    remove,
  }
}
