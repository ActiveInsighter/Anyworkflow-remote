import { CalendarClock, ChevronLeft, ChevronRight, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { AppPage, EmptyState, ErrorBanner, LoadingState, PageHeader, Panel } from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/useAsyncData'
import { toErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { formatUtcOffset } from '@/lib/recurrence'
import { deleteRunSchedule, listRunSchedules, setRunScheduleEnabled, type RunSchedule } from '@/lib/run-schedules'
import { useSession } from '@/lib/session'

export function RunSchedulesPage() {
  const session = useSession()
  return <RunSchedulesView key={(session?.baseUrl || '') + ':' + (session?.record.id || '')} />
}
function RunSchedulesView() {
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<RunSchedule | null>(null)
  const state = useAsyncData(signal => listRunSchedules(page, signal), [page], { pollMs: 15000, errorMessage: toErrorMessage })
  async function toggle(schedule: RunSchedule) {
    if (busy) return
    setBusy(true); setError('')
    try {
      await setRunScheduleEnabled(schedule, !schedule.enabled)
      toast.success(schedule.enabled ? '重复计划已暂停' : '重复计划已恢复')
      await state.reload()
    } catch (cause) { setError(toErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!deleting || busy) return
    setBusy(true); setError('')
    try {
      await deleteRunSchedule(deleting)
      setDeleting(null); toast.success('重复计划已删除')
      if (state.data?.items.length === 1 && page > 1) setPage(value => value - 1)
      else await state.reload()
    } catch (cause) { setError(toErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <AppPage>
    <PageHeader title="重复计划" description="按固定时区每天执行，保留每次 Run 的历史。" actions={<>
      <Button variant="outline" aria-label="刷新重复计划" onClick={() => void state.reload()} disabled={busy || state.refreshing}><RefreshCw /></Button>
      <Button asChild><Link to="/runs/new"><Plus />新建</Link></Button>
    </>} />
    {error || state.error ? <ErrorBanner>{error || state.error}</ErrorBanner> : null}
    {state.loading && !state.data ? <LoadingState /> : state.data?.items.length === 0 ? <EmptyState title="暂无重复计划"
      description="在 Run 编辑器的执行计划中选择每天，再保存并运行。" action={<Button asChild><Link to="/runs/new">新建 Run</Link></Button>} /> : null}
    <div className="grid gap-3">
      {state.data?.items.map(schedule => <Panel key={schedule.id} className="min-w-0 p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0"><Link className="break-words text-sm font-medium underline-offset-4 hover:underline" to={`/runs/${schedule.sourceRun}`}>{schedule.title || '未命名工作流'}</Link>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="size-4" />每天 {schedule.rule.time} · {formatUtcOffset(schedule.rule.utcOffsetMinutes)}</div>
          </div>
          <Badge variant={schedule.enabled ? 'secondary' : 'outline'} className="shrink-0">{schedule.enabled ? '已启用' : '已暂停'}</Badge>
        </div>
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <div><dt className="text-muted-foreground">下次执行</dt><dd className="mt-1">{schedule.enabled ? formatDateTime(schedule.nextRunAt) : '恢复后从下次时间开始'}</dd></div>
          <div><dt className="text-muted-foreground">已跳过</dt><dd className="mt-1">{schedule.skippedCount} 次{schedule.lastSkippedAt ? ` · 最近 ${formatDateTime(schedule.lastSkippedAt)}` : ''}</dd></div>
        </dl>
        {schedule.lastError ? <div className="mt-3"><ErrorBanner>{schedule.lastError}</ErrorBanner></div> : null}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void toggle(schedule)}>{schedule.enabled ? <Pause /> : <Play />}{schedule.enabled ? '暂停重复' : '恢复重复'}</Button>
          {schedule.lastRun ? <Button size="sm" variant="outline" asChild><Link to={`/runs/${schedule.lastRun}`}>最近执行</Link></Button> : null}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleting(schedule)}><Trash2 />删除计划</Button>
        </div>
      </Panel>)}
    </div>
    {state.data && state.data.totalPages > 1 ? <div className="mt-4 flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" aria-label="上一页" disabled={page <= 1 || state.refreshing} onClick={() => setPage(value => value - 1)}><ChevronLeft /></Button>
      <span className="text-xs">{page} / {state.data.totalPages}</span>
      <Button variant="outline" size="sm" aria-label="下一页" disabled={page >= state.data.totalPages || state.refreshing} onClick={() => setPage(value => value + 1)}><ChevronRight /></Button>
    </div> : null}
    <p className="mt-4 text-xs leading-5 text-muted-foreground">前一次仍在排队或运行时跳过本次。错过超过 15 分钟的执行不补跑；暂停或删除计划不取消已提交的 Run。</p>
    <ConfirmDeleteDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null) }} title="删除重复计划？"
      description="后续将不再重复执行，已生成的 Run 和执行历史保留。" busy={busy} onConfirm={() => void remove()} />
  </AppPage>
}
