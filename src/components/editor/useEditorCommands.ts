import { startCompletion } from '@codemirror/autocomplete'
import { isolateHistory, redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { readClipboard, writeClipboard } from '@/lib/clipboard'
import { collectUsableVariables, formatAnyWorkflowSource } from './anyworkflow-dsl'
import { planSmartCopy, planSmartDelete, planStructuredInsert, type StructuredInsertKind } from './editor-commands'
import { offsetForLineColumn } from './editor-helpers'

/** CodeMirror transactions and clipboard effects stay separate from the React editor shell. */
export function useEditorCommands(viewRef: RefObject<EditorView | null>) {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
  }, [])

  const insert = useCallback((text: string, cursorOffset?: number, selectionLength = 0) => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    const selection = view.state.selection.main
    const offset = Math.max(0, Math.min(cursorOffset ?? text.length, text.length))
    const anchor = selection.from + offset
    const head = anchor + Math.max(0, Math.min(selectionLength, text.length - offset))
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      annotations: isolateHistory.of('full'),
      selection: { anchor, head },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const insertStructured = useCallback((kind: StructuredInsertKind) => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    const source = view.state.doc.toString()
    const plan = planStructuredInsert(source, view.state.selection.main.head, kind)
    if (!plan.ok) {
      toast.info(plan.message)
      view.focus()
      return
    }

    const anchor = plan.from + plan.cursorOffset
    view.dispatch({
      changes: { from: plan.from, insert: plan.text },
      annotations: isolateHistory.of('full'),
      selection: { anchor, head: anchor + (plan.selectionLength ?? 0) },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const runSmartDelete = useCallback(() => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    const selection = view.state.selection.main
    const plan = planSmartDelete(view.state.doc.toString(), selection.from, selection.to)
    if (!plan.ok) {
      toast.info(plan.message)
      view.focus()
      return
    }

    view.dispatch({
      changes: { from: plan.from, to: plan.to, insert: '' },
      annotations: isolateHistory.of('full'),
      selection: { anchor: plan.from },
      scrollIntoView: true,
    })
    toast.success(plan.message)
    view.focus()
  }, [])

  const runUndo = useCallback(() => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    undo(view)
    view.focus()
  }, [])

  const runRedo = useCallback(() => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    redo(view)
    view.focus()
  }, [])

  const runFormat = useCallback(() => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    const current = view.state.doc.toString()
    const next = formatAnyWorkflowSource(current)
    if (next === current) {
      toast.info('格式已经整齐了')
      return
    }
    const selection = view.state.selection.main
    const line = view.state.doc.lineAt(selection.head)
    const column = selection.head - line.from + 1
    const anchor = offsetForLineColumn(next, line.number, column)
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
      annotations: isolateHistory.of('full'),
      selection: { anchor },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const runCopy = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const selection = view.state.selection.main
    const plan = planSmartCopy(view.state.doc.toString(), selection.from, selection.to)
    if (!plan.ok) {
      toast.info(plan.message)
      return
    }
    const ok = await writeClipboard(plan.text)
    // Clipboard permission may resolve after unmount or after the editor has been recreated.
    if (viewRef.current !== view) return
    if (ok) {
      setCopied(true)
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
      toast.success(plan.message)
    } else {
      toast.error('复制失败', { description: '浏览器拒绝了剪贴板写入，请手动选择后复制。' })
    }
    view.focus()
  }, [])

  const runPaste = useCallback(async () => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    try {
      const text = await readClipboard()
      if (viewRef.current !== view) return
      if (!text) {
        toast.info('剪贴板为空')
        return
      }
      insert(text)
      toast.success('已粘贴到光标位置')
    } catch {
      if (viewRef.current !== view) return
      toast.error('无法读取剪贴板', { description: '请允许浏览器访问剪贴板，或使用系统粘贴快捷键。' })
    }
  }, [insert])

  const insertVariableReference = useCallback(() => {
    const view = viewRef.current
    if (!view || view.state.readOnly) return
    const selection = view.state.selection.main
    const from = selection.from
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: '%%' },
      annotations: isolateHistory.of('full'),
      selection: { anchor: from + 1 },
      scrollIntoView: true,
    })
    view.focus()

    const available = collectUsableVariables(view.state.doc.toString(), from + 1)
    if (available.length === 0) {
      toast.info('当前位置没有可用变量')
      return
    }
    startCompletion(view)
  }, [])

  return { insert, insertStructured, runSmartDelete, runUndo, runRedo, runFormat, runCopy, runPaste, insertVariableReference, copied }
}
