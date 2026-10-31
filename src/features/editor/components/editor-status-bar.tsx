import type { ReactNode } from 'react'
import type { EditorStatus } from '../lib/editor-status'

/**
 * Cursor position, what the plan expands to and document size, with a trailing slot for the
 * issues toggle. Phones keep one short line: position, Acts and the toggle.
 */
export function EditorStatusBar({
  status,
  expanded,
  trailing,
}: {
  status: EditorStatus
  /** Events and Acts after loops are unrolled; null while the plan cannot be expanded. */
  expanded: { events: number; acts: number } | null
  trailing: ReactNode
}) {
  return (
    <div className="flex min-h-8 shrink-0 items-center justify-between gap-3 border-t border-cm-border bg-cm-toolbar-bg px-2.5 py-1 text-micro text-muted-foreground">
      <div className="flex min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap tabular-nums">
        <span>
          <span className="max-sm:hidden">行 </span>
          {status.line}:{status.column}
        </span>
        {status.selected > 0 ? <span className="text-foreground">已选 {status.selected}</span> : null}
        {expanded ? (
          <span title="循环展开后的数量">
            {expanded.events} Event · <span className="text-foreground">{expanded.acts} Act</span>
          </span>
        ) : null}
        <span className="max-sm:hidden">
          {status.chars} 字符 · {status.lines} 行
        </span>
        <span className="hidden xl:inline">Ctrl/⌘ S 保存 · Ctrl/⌘ Z 撤销</span>
      </div>
      {trailing}
    </div>
  )
}
