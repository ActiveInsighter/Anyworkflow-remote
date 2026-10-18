import { Copy, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { canDeleteRun, canEditRun, isTerminalStatus, runTitle } from '@/lib/domain/run-status'
import type { DispatchRunRecord } from '@/types'

/** Per-row Run actions. Only actions the Run's state allows are offered. */
export function RunActionsMenu({
  run,
  disabled = false,
  onCopy,
  onDelete,
}: {
  run: DispatchRunRecord
  disabled?: boolean
  onCopy: (run: DispatchRunRecord, status: 'draft' | 'queued') => void
  onDelete: (run: DispatchRunRecord) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-touch" variant="ghost" aria-label={`操作 ${runTitle(run)}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {canEditRun(run) ? (
            <DropdownMenuItem asChild>
              <Link to={`/runs/${run.id}/edit`}>
                <Pencil />
                编辑
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={disabled} onSelect={() => onCopy(run, 'draft')}>
            <Copy />
            复制为草稿
          </DropdownMenuItem>
          {isTerminalStatus(run.status) ? (
            <DropdownMenuItem disabled={disabled} onSelect={() => onCopy(run, 'queued')}>
              <RotateCcw />
              完整重跑
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {canDeleteRun(run) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={disabled} onSelect={() => onDelete(run)}>
              <Trash2 />
              删除
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
