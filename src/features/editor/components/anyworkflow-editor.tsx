import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { startCompletion } from '@codemirror/autocomplete'
import { cn } from '@/lib/utils'
import { useCodeMirror } from '../hooks/use-code-mirror'
import { useEditorCommands } from '../hooks/use-editor-commands'
import { useEditorFullscreen } from '../hooks/use-editor-fullscreen'
import { EditorIssuesPanel, EditorIssuesToggle } from './editor-issues'
import { EditorStatusBar } from './editor-status-bar'
import { EditorToolbar } from './editor-toolbar'

export type { EditorIssue } from '../lib/editor-helpers'

export interface AnyWorkflowEditorHandle {
  focus: () => void
  insert: (text: string, cursorOffset?: number, selectionLength?: number) => void
  complete: () => void
  undo: () => void
  redo: () => void
  format: () => void
  /** Selects a range so the offending line is visibly marked, then scrolls to it. */
  reveal: (from: number, to: number) => void
  getSource: () => string
}

interface AnyWorkflowEditorProps {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  readOnly?: boolean
  className?: string
}

/** AnyWorkflow DSL editor: toolbar, CodeMirror surface, lint panel and status bar. */
export const AnyWorkflowEditor = forwardRef<AnyWorkflowEditorHandle, AnyWorkflowEditorProps>(function AnyWorkflowEditor(
  { value, onChange, onSave, readOnly = false, className },
  ref,
) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const { mountRef, viewRef, status, issues, save } = useCodeMirror({ value, onChange, onSave, readOnly })
  const { fullscreen, toggleFullscreen } = useEditorFullscreen(shellRef, viewRef)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const commands = useEditorCommands(viewRef)

  const reveal = useCallback(
    (from: number, to: number) => {
      const view = viewRef.current
      if (!view) return
      const max = view.state.doc.length
      const start = Math.max(0, Math.min(from, max))
      const end = Math.max(start, Math.min(to, max))
      view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true })
      view.focus()
    },
    [viewRef],
  )

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      insert: commands.insert,
      undo: commands.runUndo,
      redo: commands.runRedo,
      format: commands.runFormat,
      complete() {
        const view = viewRef.current
        if (!view) return
        view.focus()
        startCompletion(view)
      },
      reveal,
      getSource: () => viewRef.current?.state.doc.toString() ?? '',
    }),
    [commands.insert, commands.runUndo, commands.runRedo, commands.runFormat, reveal, viewRef],
  )

  return (
    <div
      ref={shellRef}
      data-fullscreen={fullscreen ? 'true' : undefined}
      className={cn(
        'aw-editor-shell flex flex-col overflow-hidden border border-cm-border bg-cm-bg',
        fullscreen
          ? 'fixed inset-x-0 top-0 z-overlay h-dvh rounded-none'
          : 'h-[min(64dvh,840px)] min-h-[280px] rounded-lg sm:h-[clamp(560px,70dvh,760px)]',
        !fullscreen && className,
      )}
    >
      <EditorToolbar
        readOnly={readOnly}
        canUndo={status.canUndo}
        canRedo={status.canRedo}
        copied={commands.copied}
        fullscreen={fullscreen}
        actions={{
          insertStructured: commands.insertStructured,
          insert: commands.insert,
          insertVariable: commands.insertVariableReference,
          insertLoop: commands.insertLoop,
          smartDelete: commands.runSmartDelete,
          undo: commands.runUndo,
          redo: commands.runRedo,
          paste: commands.runPaste,
          format: commands.runFormat,
          copy: commands.runCopy,
          toggleFullscreen,
          save: onSave ? save : undefined,
        }}
      />
      <div ref={mountRef} className="aw-code-editor min-h-0 flex-1 overflow-hidden" />
      {issuesOpen ? <EditorIssuesPanel issues={issues} onReveal={reveal} /> : null}
      <EditorStatusBar
        status={status}
        trailing={<EditorIssuesToggle issues={issues} open={issuesOpen} onOpenChange={setIssuesOpen} />}
      />
    </div>
  )
})
