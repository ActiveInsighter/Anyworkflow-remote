import { useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import type { CommandOutcome } from '../lib/editor-command-registry'
import { anyWorkflowExtensions, reconfigureEditor, type EditorConfig } from '../lib/editor-extensions'
import { sameIssues, type EditorIssue } from '../lib/editor-helpers'
import { EMPTY_STATUS, readIssues, readStatus, sameStatus, type EditorStatus } from '../lib/editor-status'

/**
 * Owns one CodeMirror view. CodeMirror manages its own DOM: the view mounts once into a stable
 * parent, transactions drive every document change, and React only mirrors status and lint
 * results for the surrounding chrome. Config changes are applied in place.
 */
export function useCodeMirror({
  value,
  onChange,
  onSave,
  onOutcome,
  config,
}: {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  onOutcome: (outcome: CommandOutcome) => void
  config: EditorConfig
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  const changeRef = useRef(onChange)
  const saveRef = useRef(onSave)
  const outcomeRef = useRef(onOutcome)
  const configRef = useRef(config)
  const [status, setStatus] = useState<EditorStatus>(EMPTY_STATUS)
  const [issues, setIssues] = useState<EditorIssue[]>([])

  changeRef.current = onChange
  saveRef.current = onSave
  outcomeRef.current = onOutcome

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || viewRef.current) return

    const sync = (view: EditorView) => {
      const nextStatus = readStatus(view.state)
      const nextIssues = readIssues(view.state)
      setStatus((prev) => (sameStatus(prev, nextStatus) ? prev : nextStatus))
      setIssues((prev) => (sameIssues(prev, nextIssues) ? prev : nextIssues))
    }

    const view = new EditorView({
      doc: valueRef.current,
      parent: mount,
      extensions: anyWorkflowExtensions({
        config: configRef.current,
        onSave: () => saveRef.current?.(),
        onOutcome: (outcome) => outcomeRef.current(outcome),
        onUpdate: (update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString()
            if (next !== valueRef.current) {
              valueRef.current = next
              changeRef.current(next)
            }
          }
          // Selection and lint-result transactions update the chrome too, so the status bar and
          // the issue panel stay in step with what the editor is actually showing.
          sync(update.view)
        },
      }),
    })
    viewRef.current = view
    sync(view)
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    const effects = reconfigureEditor(configRef.current, config)
    configRef.current = config
    if (view && effects.length) view.dispatch({ effects })
  }, [config])

  useEffect(() => {
    const view = viewRef.current
    valueRef.current = value
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return { mountRef, viewRef, status, issues }
}
