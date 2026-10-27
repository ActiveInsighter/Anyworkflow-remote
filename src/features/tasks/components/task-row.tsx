import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { useNow } from '@/hooks/use-now'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { taskSource, type TaskItem } from '../lib/sources'
import { TaskProgress, TaskStatusBadge } from './task-status'

/** One task in the task center: kind, title, phase, progress and when it last changed. */
export function TaskRow({ item, onNavigate }: { item: TaskItem; onNavigate?: () => void }) {
  const now = useNow()
  const source = taskSource(item.kind)
  const Icon = source.icon
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      className="group/task flex min-h-touch items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-fast outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
          item.view.active ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-body font-medium">{item.title}</span>
          <TaskStatusBadge kind={item.kind} record={item.record} className="h-5 shrink-0 px-1.5 text-micro" />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground">
          <span className="shrink-0">{source.label}</span>
          {item.detail ? <span aria-hidden="true">·</span> : null}
          {item.detail ? <span className="min-w-0 truncate">{item.detail}</span> : null}
          <span className="ms-auto shrink-0 tabular-nums">{formatRelativeTime(item.updated, now)}</span>
        </span>
        <TaskProgress view={item.view} className="mt-2" />
      </span>
      <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground/60 transition-transform duration-fast group-hover/task:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
