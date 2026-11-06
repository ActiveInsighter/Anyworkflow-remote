import type * as React from 'react'
import type { TaskRecord } from '@shared/task-kit/index.mjs'
import { CircleAlert, CircleCheck, CircleDot, CircleMinus, CircleStop, CircleX, Clock3, Ellipsis, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { taskStatusMeta, type TaskKind, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import type { StatusTone } from '@/types'
import { TaskProgress } from './task-status'

const toneText: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

function markIcon(view: TaskView): LucideIcon {
  if (view.stopping) return CircleStop
  if (view.state === 'running') return CircleDot
  if (view.state === 'queued') return Clock3
  if (view.state === 'succeeded') return CircleCheck
  if (view.state === 'partial') return CircleAlert
  if (view.state === 'failed') return CircleX
  return CircleMinus
}

/** Overflow for a job row: everything except the one action its state puts first. */
export function JobMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-touch" aria-label={label} className="text-muted-foreground sm:size-8">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One async job in a tool's history: a state mark, its name, what is known about it, and a single
 * action chosen by its state. The rest lives in `menu`, so a page of rows stays calm. Rows sit on
 * the page without a frame; the mark and status text carry the state.
 */
export function JobRow({
  kind,
  record,
  title,
  onOpen,
  meta,
  action,
  menu,
  children,
}: {
  kind: TaskKind
  record: TaskRecord
  title: string
  /** Opens the record's detail; the name becomes the control. */
  onOpen?: () => void
  /** Facts in reading order; empty entries are dropped. */
  meta: React.ReactNode[]
  action?: React.ReactNode
  menu?: React.ReactNode
  /** Under the progress rail: errors, notes. */
  children?: React.ReactNode
}) {
  const view = kind.describe(record)
  const status = taskStatusMeta(kind, record)
  const Mark = markIcon(view)

  return (
    <article className="-mx-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-x-3 rounded-xl px-3 py-3 transition-colors duration-fast hover:bg-subtle">
      <Mark aria-hidden="true" className={cn('col-start-1 row-start-1 mt-0.5 size-4.5 shrink-0', toneText[status.tone])} />

      <div className="col-span-2 col-start-2 row-start-1 min-w-0 sm:col-span-1">
        <h3 className="min-w-0 text-body font-medium [overflow-wrap:anywhere] sm:truncate">
          {onOpen ? (
            <button
              type="button"
              title={title}
              onClick={onOpen}
              className="max-w-full cursor-pointer truncate-sm rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/35"
            >
              {title}
            </button>
          ) : (
            <span title={title}>{title}</span>
          )}
        </h3>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 text-caption text-muted-foreground tabular-nums">
          <span className={cn('font-medium', toneText[status.tone])}>{status.label}</span>
          {meta.filter(Boolean).map((item, index) => (
            <span key={index} className="min-w-0 [overflow-wrap:anywhere]">
              {item}
            </span>
          ))}
        </div>
      </div>

      {view.state === 'running' || children ? (
        <div className="col-span-3 col-start-2 row-start-2 mt-2 flex min-w-0 flex-col gap-2 empty:hidden">
          <TaskProgress view={view} className="max-w-64" />
          {children}
        </div>
      ) : null}

      {action ? (
        <div className="col-span-3 col-start-2 row-start-3 mt-2 flex items-center gap-1 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0">{action}</div>
      ) : null}
      {menu ? <div className="col-start-4 row-start-1 -my-1 sm:my-0">{menu}</div> : null}
    </article>
  )
}

/** A job's failure or retry note, directly under its row. */
export function JobNote({ tone = 'danger', children }: { tone?: 'danger' | 'warning'; children: React.ReactNode }) {
  return <p className={cn('text-caption [overflow-wrap:anywhere]', toneText[tone])}>{children}</p>
}
