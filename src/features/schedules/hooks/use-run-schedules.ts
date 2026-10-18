import { useState } from 'react'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api'
import { deleteRunSchedule, listRunSchedules, setRunScheduleEnabled, type RunSchedule } from '@/lib/api/run-schedules'

const SCHEDULES_POLL_MS = 15_000

/**
 * Daily schedules with pause/resume/delete. Writes carry the schedule revision, so a concurrent
 * edit surfaces as an inline conflict instead of overwriting.
 */
export function useRunSchedules() {
  const [page, setPage] = useState(1)
  const state = useAsyncData((signal) => listRunSchedules(page, signal), [page], {
    pollMs: SCHEDULES_POLL_MS,
    errorMessage: toErrorMessage,
  })
  const action = useAsyncAction()

  function toggle(schedule: RunSchedule) {
    void action.run(
      schedule.id,
      async () => {
        await setRunScheduleEnabled(schedule, !schedule.enabled)
        await state.reload()
      },
      { success: schedule.enabled ? '重复计划已暂停' : '重复计划已恢复', failure: false },
    )
  }

  async function remove(schedule: RunSchedule): Promise<boolean> {
    const done = await action.run(
      schedule.id,
      async () => {
        await deleteRunSchedule(schedule)
        if (state.data?.items.length === 1 && page > 1) setPage((value) => value - 1)
        else await state.reload()
        return true
      },
      { success: '重复计划已删除', failure: false },
    )
    return Boolean(done)
  }

  return { state, page, setPage, busy: action.busy, error: action.error || state.error, toggle, remove }
}
