import { useState } from 'react'
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { UploadQueue } from '../hooks/use-upload-queue'

function summary(queue: UploadQueue) {
  const active = queue.items.filter((item) => item.status === 'uploading' || item.status === 'queued')
  const done = queue.items.filter((item) => item.status === 'done').length
  const failed = queue.items.filter((item) => item.status === 'failed').length
  if (active.length) return { busy: true, text: `正在上传 ${active.length} 项`, tone: 'text-foreground' }
  if (failed) return { busy: false, text: done ? `已完成 ${done} 项，${failed} 项失败` : `${failed} 项上传失败`, tone: 'text-danger' }
  if (done) return { busy: false, text: `已完成 ${done} 项上传`, tone: 'text-foreground' }
  return { busy: false, text: '上传已取消', tone: 'text-muted-foreground' }
}

/** Upload progress floating above the content; expands to one line per file. */
export function UploadPanel({ queue }: { queue: UploadQueue }) {
  const [expanded, setExpanded] = useState(false)
  if (!queue.items.length) return null
  const state = summary(queue)
  const failed = queue.items.some((item) => item.status === 'failed')
  const total = queue.items.filter((item) => item.status !== 'canceled')
  const progress = total.length ? Math.round(total.reduce((sum, item) => sum + (item.status === 'failed' ? 100 : item.progress), 0) / total.length) : 0
  return (
    <section
      aria-label="上传"
      className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-chrome overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
    >
      <div className="flex min-h-14 items-center gap-3 ps-4 pe-1.5">
        <span className={cn('grid size-6 shrink-0 place-items-center', state.tone)}>
          {state.busy ? <Spinner /> : failed ? <CircleAlert className="size-5" aria-hidden="true" /> : <CircleCheck className="size-5 text-success" aria-hidden="true" />}
        </span>
        <p role="status" aria-live="polite" className={cn('min-w-0 flex-1 truncate text-body font-medium', state.tone)}>
          {state.text}
          {state.busy ? <span className="ms-1.5 font-mono text-caption text-muted-foreground tabular-nums">{progress}%</span> : null}
        </p>
        <Button variant="ghost" size="icon-touch" className="rounded-full" aria-expanded={expanded} aria-label={expanded ? '收起上传列表' : '展开上传列表'} onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown /> : <ChevronUp />}
        </Button>
        <Button
          variant="ghost"
          size="icon-touch"
          className="rounded-full"
          aria-label={state.busy ? '取消全部上传' : '关闭上传提示'}
          onClick={state.busy ? queue.cancelAll : queue.dismiss}
        >
          <X />
        </Button>
      </div>
      {state.busy ? <Progress value={progress} aria-label="上传总进度" className="h-0.5 rounded-none" /> : null}
      {expanded ? (
        <ul className="max-h-60 overflow-y-auto border-t py-1">
          {queue.items.map((item) => (
            <li key={item.key} className="flex min-h-12 items-center gap-3 px-4 py-1.5">
              <FileText className="size-4 shrink-0 text-danger" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.name}</p>
                <p className={cn('truncate text-micro tabular-nums', item.status === 'failed' ? 'text-danger' : 'text-muted-foreground')}>
                  {item.status === 'uploading'
                    ? item.progress >= 100 ? '正在保存…' : `上传中 ${item.progress}%`
                    : item.status === 'queued' ? '等待上传' : item.status === 'done' ? '已上传' : item.status === 'canceled' ? '已取消' : item.error}
                </p>
              </div>
              {item.status === 'done' ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
