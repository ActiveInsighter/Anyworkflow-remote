import { useNavigate } from 'react-router'
import { useAsyncAction } from '@/hooks/use-async-action'
import { cloneRun, deleteRun } from '@/lib/api'
import type { DispatchRunRecord } from '@/types'
import { invalidateRuns } from '../lib/query-keys'

/** Row actions on the Run list: fork a copy and delete. */
export function useRunListActions({ onDeleted }: { onDeleted: () => Promise<void> | void }) {
  const navigate = useNavigate()
  const action = useAsyncAction()

  function copy(run: DispatchRunRecord, status: 'draft' | 'queued') {
    void action.run(
      run.id,
      async () => {
        const copied = await cloneRun(run, status)
        invalidateRuns({ lists: true })
        navigate(status === 'draft' ? `/runs/${copied.id}/edit` : `/runs/${copied.id}`)
      },
      { success: status === 'draft' ? '已复制为草稿' : '已创建重跑' },
    )
  }

  async function remove(run: DispatchRunRecord): Promise<boolean> {
    const done = await action.run(
      run.id,
      async () => {
        await deleteRun(run)
        invalidateRuns({ lists: true })
        await onDeleted()
        return true
      },
      { success: 'Run 已删除', failure: '删除失败' },
    )
    return Boolean(done)
  }

  return { pendingId: action.pending, busy: action.busy, error: action.error, copy, remove }
}
