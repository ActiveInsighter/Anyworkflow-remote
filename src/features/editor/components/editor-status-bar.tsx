import type { ReactNode } from 'react'
import type { EditorStatus } from '../lib/editor-status'

/** Cursor position and document size, with a trailing slot for the issues toggle. */
export function EditorStatusBar({ status, trailing }: { status: EditorStatus; trailing: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-cm-border bg-cm-toolbar-bg px-2.5 py-1 text-micro text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
        <span>
          行 {status.line}，列 {status.column}
        </span>
        {status.selected > 0 ? <span>已选 {status.selected}</span> : null}
        <span>
          {status.chars} 字符 · {status.lines} 行
        </span>
        <span className="hidden xl:inline">Ctrl/⌘ S 保存 · Ctrl/⌘ Z 撤销</span>
      </div>
      {trailing}
    </div>
  )
}
