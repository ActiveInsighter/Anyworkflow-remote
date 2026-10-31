import { CircleAlert, Workflow, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EventPreview } from '@/lib/workflow-dsl'
import type { ActPreviewModel } from '../lib/act-preview'

/** Events listed before the rest collapse into a count; a big plan stays quick to render. */
const MAX_EVENTS = 40
const MAX_ACTS = 30

function EventCard({ event, current, onReveal }: { event: EventPreview; current: boolean; onReveal: (line: number) => void }) {
  const hidden = event.actCount - Math.min(event.acts.length, MAX_ACTS)
  return (
    <li
      className={cn(
        'rounded-lg border bg-background/60',
        current ? 'border-primary/40 ring-1 ring-primary/20' : 'border-cm-border',
      )}
    >
      <button
        type="button"
        onClick={() => onReveal(event.line)}
        className="flex w-full min-w-0 items-center gap-2 rounded-t-lg px-2.5 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Zap className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{event.title}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-micro tabular-nums text-muted-foreground">
          {event.actCount} Act
        </span>
      </button>
      <ol className="flex flex-col border-t border-cm-border/70 px-1.5 py-1">
        {event.acts.slice(0, MAX_ACTS).map((act, index) => (
          <li key={index} className="flex min-w-0 items-baseline gap-2 rounded-md px-1 py-1 text-caption">
            <span className="w-5 shrink-0 text-end font-mono text-micro tabular-nums text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1">
              {act.title ? <span className="me-1.5 font-medium text-foreground">{act.title}</span> : null}
              <span className="line-clamp-2 break-words text-muted-foreground">{act.text || '（只打开页面或等待）'}</span>
            </span>
            {act.messages > 1 ? (
              <span className="shrink-0 text-micro tabular-nums text-muted-foreground">{act.messages} 条</span>
            ) : null}
          </li>
        ))}
        {hidden > 0 ? <li className="px-1 py-1 text-micro text-muted-foreground">还有 {hidden} 个 Act…</li> : null}
      </ol>
    </li>
  )
}

/**
 * What the plan expands to, Act by Act, with loops already unrolled: the quickest way to check a
 * loop does what was meant. With the cursor in an Event, its Events come first.
 */
export function EditorActPreview({ preview, onRevealLine }: { preview: ActPreviewModel; onRevealLine: (line: number) => void }) {
  const { events, focused } = preview
  const rest = focused.length ? events.filter((event) => event.line !== preview.focusLine) : events
  const shown = rest.slice(0, Math.max(0, MAX_EVENTS - focused.length))
  let lastTask = ''

  return (
    <div className="flex flex-col gap-2 p-1.5">
      <p className="px-2 pt-1 text-micro tabular-nums text-muted-foreground">
        展开后 {preview.eventCount} 个 Event · {preview.actCount} 个 Act
      </p>
      {preview.errors ? (
        <p className="mx-1 flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-caption text-danger">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          有 {preview.errors} 个错误，出错的 Event 不在预览里。
        </p>
      ) : null}
      {events.length === 0 && !preview.errors ? (
        <p className="px-3 py-6 text-center text-caption text-muted-foreground">还没有可以执行的 Event。</p>
      ) : null}
      {focused.length ? (
        <section aria-label="光标所在 Event" className="flex flex-col gap-1.5">
          <h3 className="px-2 text-micro font-medium text-primary">
            光标所在 Event{focused.length > 1 ? ` · 循环生成 ${focused.length} 个` : ''}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {focused.slice(0, MAX_EVENTS).map((event, index) => (
              <EventCard key={`f${index}`} event={event} current onReveal={onRevealLine} />
            ))}
          </ul>
        </section>
      ) : null}
      {shown.length ? (
        <ul className="flex flex-col gap-1.5">
          {shown.map((event, index) => {
            const header = event.taskTitle !== lastTask
            lastTask = event.taskTitle
            return (
              <li key={index} className="flex flex-col gap-1.5">
                {header ? (
                  <p className="mt-1 flex items-center gap-1.5 px-2 text-micro font-medium text-muted-foreground">
                    <Workflow className="size-3 text-primary" aria-hidden="true" />
                    {event.taskTitle}
                  </p>
                ) : null}
                <ul>
                  <EventCard event={event} current={false} onReveal={onRevealLine} />
                </ul>
              </li>
            )
          })}
        </ul>
      ) : null}
      {rest.length > shown.length ? (
        <p className="px-2 pb-1 text-micro text-muted-foreground">还有 {rest.length - shown.length} 个 Event 未列出。</p>
      ) : null}
    </div>
  )
}
