import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, Plus, RefreshCw } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page, PageHeader } from '@/components/layout/page'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import type { RunSchedule } from '@/lib/api/run-schedules'
import { useSession } from '@/lib/api/session'
import { ScheduleCard } from '@/features/schedules/components/schedule-card'
import { useRunSchedules } from '@/features/schedules/hooks/use-run-schedules'

export function SchedulesPage() {
  const session = useSession()
  // A different backend or account must not show the previous one's schedules.
  return <SchedulesView key={`${session?.baseUrl || ''}:${session?.record.id || ''}`} />
}

function SchedulesView() {
  const { state, page, setPage, busy, error, toggle, remove } = useRunSchedules()
  const [deleting, setDeleting] = useState<RunSchedule | null>(null)

  return (
    <Page>
      <PageHeader
        compact
        title="重复计划"
        description="按固定时区每天执行，保留每次 Run 的历史。"
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="刷新重复计划"
              onClick={() => void state.reload()}
              disabled={busy || state.refreshing}
            >
              <RefreshCw className={state.refreshing ? 'animate-spin' : undefined} />
            </Button>
            <Button asChild size="touch">
              <Link to="/runs/new">
                <Plus data-icon="inline-start" />
                新建
              </Link>
            </Button>
          </>
        }
      />

      <ErrorAlert>{error}</ErrorAlert>

      {state.loading && !state.data ? <LoadingState /> : null}
      {state.data?.items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="暂无重复计划"
          description="在 Run 编辑器的执行计划中选择每天，再保存并运行。"
          action={
            <Button asChild>
              <Link to="/runs/new">新建 Run</Link>
            </Button>
          }
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {state.data?.items.map((schedule) => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            busy={busy}
            onToggle={() => toggle(schedule)}
            onDelete={() => setDeleting(schedule)}
          />
        ))}
      </div>

      {state.data ? (
        <Pager
          page={page}
          totalPages={state.data.totalPages}
          totalItems={state.data.totalItems}
          onPageChange={setPage}
          disabled={state.refreshing}
        />
      ) : null}

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        前一次仍在排队或运行时跳过本次。错过超过 15 分钟的执行不补跑；暂停或删除计划不取消已提交的 Run。
      </p>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除重复计划？"
        description="后续将不再重复执行，已生成的 Run 和执行历史保留。"
        busy={busy}
        onConfirm={async () => {
          if (deleting && (await remove(deleting))) setDeleting(null)
        }}
      />
    </Page>
  )
}
