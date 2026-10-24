import { Archive, Bookmark, BookmarkCheck, Copy, MoreHorizontal, Pause, Pencil, Play, RotateCcw, Save, Trash2, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { canDeleteRun, canEditRun, isTerminalStatus, runControls } from '@/lib/domain/run-status'
import type { DispatchRunRecord } from '@/types'
import type { useRunDetailActions } from '../../hooks/use-run-detail-actions'

type RunDetailActions = ReturnType<typeof useRunDetailActions>

/**
 * Header actions for a Run. State-changing commands stay visible as buttons; library and copy
 * actions live in the overflow menu so the header never wraps into a wall of buttons.
 */
export function RunHeaderActions({
  run,
  favorited,
  schedulePending,
  actions,
  onDelete,
  onExport,
  menuTriggerRef,
}: {
  run: DispatchRunRecord
  favorited: boolean
  schedulePending: boolean
  actions: RunDetailActions
  onDelete: () => void
  onExport: () => void
  menuTriggerRef?: Ref<HTMLButtonElement>
}) {
  const { canPause, canResume, canCancel } = runControls(run)
  const terminal = isTerminalStatus(run.status)
  const hasPlan = Boolean(run.planText.trim())
  const busy = actions.busy
  const runLabel = run.recurrence ? '启用每天重复' : schedulePending ? '按计划运行' : '运行'

  return (
    <>
      {canEditRun(run) ? (
        <Button variant="outline" size="touch" asChild>
          <Link to={`/runs/${run.id}/edit`}>
            <Pencil data-icon="inline-start" />
            编辑
          </Link>
        </Button>
      ) : null}
      {terminal ? (
        <Button size="touch" onClick={() => actions.copy('queued')} disabled={busy || !hasPlan}>
          <RotateCcw data-icon="inline-start" />
          完整重跑
        </Button>
      ) : null}
      {run.status === 'draft' ? (
        <Button size="touch" onClick={() => actions.publish(!(run.recurrence || schedulePending))} disabled={busy}>
          <Play data-icon="inline-start" />
          {runLabel}
        </Button>
      ) : null}
      {canPause ? (
        <Button variant="outline" size="touch" onClick={() => actions.command('pause')} disabled={busy}>
          <Pause data-icon="inline-start" />
          暂停
        </Button>
      ) : null}
      {canResume ? (
        <Button variant="secondary" size="touch" onClick={() => actions.command('resume')} disabled={busy}>
          <Play data-icon="inline-start" />
          继续
        </Button>
      ) : null}
      {run.status === 'failed' ? (
        <Button variant="secondary" size="touch" onClick={actions.resumeFromCheckpoint} disabled={busy}>
          <RotateCcw data-icon="inline-start" />
          从检查点恢复
        </Button>
      ) : null}
      {canCancel ? (
        <Button variant="destructive" size="touch" onClick={() => actions.command('cancel')} disabled={busy}>
          <XCircle data-icon="inline-start" />
          取消
        </Button>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-touch"
            aria-pressed={favorited}
            aria-label={favorited ? '取消收藏' : '收藏'}
            onClick={actions.toggleFavorite}
            disabled={busy}
          >
            {favorited ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{favorited ? '已收藏' : '收藏'}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menuTriggerRef} variant="ghost" size="icon-touch" aria-label="更多操作">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onExport}>
              <Archive />
              导出 AI 对话
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy || !hasPlan} onSelect={actions.saveTemplate}>
              <Save />
              存为模板
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy || !hasPlan} onSelect={() => actions.copy('draft')}>
              <Copy />
              复制为草稿
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {canDeleteRun(run) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={busy} onSelect={onDelete}>
                <Trash2 />
                删除
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
