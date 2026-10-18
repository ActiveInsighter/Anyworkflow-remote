import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAsyncData } from '@/hooks/use-async-data'
import { getRun, listRunVersions, listTasksForRun, toErrorMessage } from '@/lib/api'
import { getRunFavoriteForRun } from '@/lib/api/library'
import { isActiveStatus } from '@/lib/domain/run-status'
import { POLL_MS, RUN_HIERARCHY_PAGE_SIZE } from '../lib/constants'
import { runKeys } from '../lib/query-keys'

/** Task/Event to reveal on load, from `?task=&event=&eventPage=` links. */
export interface RunDeepLink {
  taskId: string
  eventId: string
  eventPage: number
}

function positivePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/**
 * Data for the Run detail view: the selected version, its Tasks page and the version family.
 *
 * The URL only seeds the view (deep links from Task/Event redirects). Switching versions or
 * paging Tasks is view-only state kept here, so it never pushes browser history.
 */
export function useRunDetail(routeRunId: string) {
  const [searchParams] = useSearchParams()
  const [versionSelection, setVersionSelection] = useState({ routeId: routeRunId, selectedId: routeRunId })
  const [taskPageSelection, setTaskPageSelection] = useState<{ runId: string; page: number } | null>(null)
  const runId = versionSelection.routeId === routeRunId ? versionSelection.selectedId : routeRunId

  const onRouteRun = runId === routeRunId
  const hasLocalTaskView = taskPageSelection?.runId === runId
  const taskPage = hasLocalTaskView ? taskPageSelection.page : onRouteRun ? positivePage(searchParams.get('taskPage')) : 1
  const followDeepLink = onRouteRun && !hasLocalTaskView
  const deepLink: RunDeepLink = {
    taskId: followDeepLink ? searchParams.get('task') || '' : '',
    eventId: followDeepLink ? searchParams.get('event') || '' : '',
    eventPage: followDeepLink ? positivePage(searchParams.get('eventPage')) : 1,
  }

  const runState = useAsyncData(
    async () => {
      const [run, favorite] = await Promise.all([getRun(runId), getRunFavoriteForRun(runId)])
      return { runId, run, favorite }
    },
    [runId],
    {
      enabled: Boolean(runId),
      pollMs: POLL_MS.runDetail,
      staleMs: POLL_MS.runDetail,
      cacheKey: runId ? runKeys.detail(runId) : undefined,
      errorMessage: toErrorMessage,
    },
  )
  const current = runState.data?.runId === runId ? runState.data : null
  const run = current?.run ?? null

  const tasksState = useAsyncData(
    async () => ({ runId, page: taskPage, result: await listTasksForRun(runId, taskPage, RUN_HIERARCHY_PAGE_SIZE) }),
    [runId, taskPage],
    {
      enabled: Boolean(runId && run),
      pollMs: run && isActiveStatus(run.status) ? POLL_MS.runDetail : undefined,
      staleMs: POLL_MS.runDetail,
      cacheKey: runId ? runKeys.tasks(runId, taskPage) : undefined,
      errorMessage: toErrorMessage,
    },
  )
  const tasks =
    tasksState.data?.runId === runId && tasksState.data.page === taskPage ? tasksState.data.result : null

  const versionsState = useAsyncData(
    async () => {
      const familyId = run?.familyId || runId
      return { familyId, versions: await listRunVersions(familyId) }
    },
    [run?.familyId, runId],
    {
      enabled: Boolean(run),
      staleMs: 30_000,
      cacheKey: run ? runKeys.family(run.familyId) : undefined,
      errorMessage: toErrorMessage,
    },
  )
  const versions = run && versionsState.data?.familyId === run.familyId ? versionsState.data.versions : []

  function selectVersion(nextRunId: string) {
    setVersionSelection({ routeId: routeRunId, selectedId: nextRunId })
    setTaskPageSelection({ runId: nextRunId, page: 1 })
  }

  function setTaskPage(page: number) {
    setTaskPageSelection({ runId, page: Math.max(1, page) })
  }

  async function reload() {
    await runState.reload()
    await tasksState.reload()
  }

  return {
    run,
    favorite: current?.favorite ?? null,
    error: runState.error,
    tasks,
    tasksLoading: tasksState.loading,
    tasksError: tasksState.error,
    taskPage,
    setTaskPage,
    versions,
    versionsError: versionsState.error,
    selectVersion,
    deepLink,
    reload,
  }
}
