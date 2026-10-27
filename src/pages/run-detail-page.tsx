import { useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page, PageHeader } from '@/components/layout/page'
import { useNow } from '@/hooks/use-now'
import { runTitle } from '@/lib/domain/run-status'
import { describeSchedule } from '@/lib/domain/schedule'
import { RunHeaderActions } from '@/features/runs/components/run-detail/run-header-actions'
import { RunScheduleBanner } from '@/features/runs/components/run-detail/run-schedule-banner'
import { RunSummaryCard } from '@/features/runs/components/run-detail/run-summary-card'
import { ExecutionRecord } from '@/features/runs/components/execution/execution-record'
import { RunVersionPicker } from '@/features/runs/components/run-detail/run-version-picker'
import { useRunDetail } from '@/features/runs/hooks/use-run-detail'
import { useRunDetailActions } from '@/features/runs/hooks/use-run-detail-actions'
import { RunExportDialog } from '@/features/run-exports/components/run-export-dialog'

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const detail = useRunDetail(runId)
  const { run, favorite, tasks } = detail
  const actions = useRunDetailActions({
    run,
    favorite,
    reload: detail.reload,
    selectVersion: detail.selectVersion,
  })
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  // `?export=1` opens the export sheet, so the task center can link straight to it.
  const [searchParams, setSearchParams] = useSearchParams()
  const exportOpen = searchParams.get('export') === '1'
  const setExportOpen = (open: boolean) =>
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      if (open) next.set('export', '1')
      else next.delete('export')
      return next
    }, { replace: true })
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const now = useNow()

  if (!run) {
    return <Page width="detail">{detail.error ? <ErrorAlert>{detail.error}</ErrorAlert> : <LoadingState />}</Page>
  }

  const schedule = describeSchedule(run.scheduledAt, new Date(now))
  const scheduleLive = schedule.pending && (run.status === 'draft' || run.status === 'queued')

  return (
    <Page width="detail">
      <PageHeader
        wrapTitle
        className="mb-4 sm:mb-5"
        title={runTitle(run)}
        actions={
          <RunHeaderActions
            run={run}
            favorited={Boolean(favorite)}
            schedulePending={schedule.pending}
            actions={actions}
            onDelete={() => setConfirmDeleteOpen(true)}
            onExport={() => setExportOpen(true)}
            menuTriggerRef={menuTriggerRef}
          />
        }
      />

      <ErrorAlert>{detail.error}</ErrorAlert>
      <ErrorAlert>{detail.tasksError}</ErrorAlert>
      <ErrorAlert>{actions.error}</ErrorAlert>

      <div className="flex flex-col gap-3">
        <RunSummaryCard
          run={run}
          totalTasks={Math.max(run.totalTasks, tasks?.totalItems || 0)}
          scheduledLabel={schedule.set ? schedule.absolute : ''}
          versionPicker={
            <RunVersionPicker versions={detail.versions} currentId={run.id} onSelect={detail.selectVersion} />
          }
        />
        <ErrorAlert inline>{detail.versionsError}</ErrorAlert>
        {scheduleLive ? (
          <RunScheduleBanner run={run} absolute={schedule.absolute} relative={schedule.relative} actions={actions} />
        ) : null}
      </div>

      <ExecutionRecord
        run={run}
        tasks={tasks}
        loading={detail.tasksLoading}
        page={detail.taskPage}
        onPageChange={detail.setTaskPage}
        deepLink={detail.deepLink}
      />

      <RunExportDialog key={run.id} run={run} open={exportOpen} onOpenChange={setExportOpen} returnFocus={() => menuTriggerRef.current} />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="删除 Run？"
        description={runTitle(run)}
        busy={actions.pending === 'delete'}
        onConfirm={() => void actions.remove()}
      />
    </Page>
  )
}
