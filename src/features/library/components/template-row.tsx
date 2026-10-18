import { Copy, FolderInput, Library, MoreHorizontal, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { ListItem } from '@/components/data-display/list-item'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDateTime } from '@/lib/format'
import type { WorkflowTemplateRecord } from '@/types'

export function templateTitle(item: Pick<WorkflowTemplateRecord, 'title'> | null | undefined) {
  return item?.title || '未命名模板'
}

export function TemplateRow({
  item,
  busy,
  onDuplicate,
  onMove,
  onDelete,
}: {
  item: WorkflowTemplateRecord
  busy: boolean
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const title = templateTitle(item)
  const useHref = `/runs/new?templateId=${encodeURIComponent(item.id)}`
  return (
    <ListItem
      title={
        <Link to={`/templates/${item.id}`} className="truncate outline-none hover:underline focus-visible:underline">
          {title}
        </Link>
      }
      meta={`${item.folderRecord?.name ? `${item.folderRecord.name} · ` : ''}${formatDateTime(item.updated)}`}
      actions={
        <>
          <Button size="sm" variant="ghost" asChild className="hidden sm:inline-flex">
            <Link to={useHref}>
              <Library data-icon="inline-start" />
              使用
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
                  <Link to={useHref}>
                    <Library />
                    使用
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDuplicate}>
                  <Copy />
                  复制
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onMove}>
                  <FolderInput />
                  移动到…
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {item.tags.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="neutral" className="text-micro">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </ListItem>
  )
}
