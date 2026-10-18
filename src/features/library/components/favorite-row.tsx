import { FolderInput, MoreHorizontal, Star, StarOff, Workflow } from 'lucide-react'
import { Link } from 'react-router'
import { ListItem } from '@/components/data-display/list-item'
import { StatusBadge } from '@/components/data-display/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { runStatusMeta, runTitle } from '@/lib/domain/run-status'
import { formatDateTime } from '@/lib/format'
import type { RunFavoriteRecord } from '@/types'

export function FavoriteRow({
  item,
  busy,
  onMove,
  onRemove,
}: {
  item: RunFavoriteRecord
  busy: boolean
  onMove: () => void
  onRemove: () => void
}) {
  const run = item.runRecord
  const status = run ? runStatusMeta(run.status, run.requestedAction) : { label: '不可用', tone: 'neutral' as const }
  const title = runTitle(run)
  return (
    <ListItem
      leading={<Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />}
      title={
        <>
          <Link to={`/runs/${item.run}`} className="truncate outline-none hover:underline focus-visible:underline">
            {title}
          </Link>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </>
      }
      meta={`${item.folderRecord?.name ? `${item.folderRecord.name} · ` : ''}${formatDateTime(item.updated)}`}
      actions={
        <>
          <Button size="sm" variant="ghost" asChild className="hidden sm:inline-flex">
            <Link to={`/runs/${item.run}`}>
              <Workflow data-icon="inline-start" />
              打开
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-touch" variant="ghost" aria-label={`操作 ${title}`} disabled={busy}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem asChild className="sm:hidden">
                  <Link to={`/runs/${item.run}`}>
                    <Workflow />
                    打开
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onMove}>
                  <FolderInput />
                  移动到…
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <StarOff />
                取消收藏
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  )
}
