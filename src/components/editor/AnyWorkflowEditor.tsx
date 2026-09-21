import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  startCompletion,
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands'
import {
  bracketMatching,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { forEachDiagnostic, linter, lintKeymap } from '@codemirror/lint'
import { highlightSelectionMatches } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from '@codemirror/view'
import {
  Check,
  CircleAlert,
  ChevronDown,
  ChevronUp,
  Info,
  TriangleAlert,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  anyWorkflowCompletion,
  collectUsableVariables,
  anyWorkflowHighlightStyle,
  anyWorkflowLanguage,
  formatAnyWorkflowSource,
  planSmartDelete,
  planStructuredInsert,
  type StructuredInsertKind,
  validateAnyWorkflowSource,
} from '@/components/editor/anyworkflow-dsl'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { offsetForLineColumn, sameIssues, type EditorIssue } from '@/components/editor/editor-helpers'
export type { EditorIssue } from '@/components/editor/editor-helpers'
import { readClipboard, writeClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

interface EditorStatus {
  canUndo: boolean
  canRedo: boolean
  line: number
  column: number
  selected: number
  chars: number
  lines: number
}

const EMPTY_STATUS: EditorStatus = {
  canUndo: false,
  canRedo: false,
  line: 1,
  column: 1,
  selected: 0,
  chars: 0,
  lines: 1,
}

const editorTheme = EditorView.theme({
  '&': {
    minHeight: '0',
    backgroundColor: 'var(--cm-bg)',
    color: 'var(--cm-fg)',
    fontSize: 'var(--ui-editor-font-size)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    minHeight: '0',
    overflow: 'auto',
    overscrollBehavior: 'auto',
    touchAction: 'pan-y pan-x',
    fontFamily: 'var(--ui-font-mono)',
    lineHeight: 'var(--ui-editor-line-height)',
  },
  '.cm-content': { padding: '12px 0 28px', caretColor: 'var(--cm-caret)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--cm-selection) !important',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cm-caret)' },
  '.cm-tooltip': {
    border: '1px solid var(--cm-border)',
    backgroundColor: 'var(--cm-tooltip-bg)',
    color: 'var(--cm-fg)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--cm-selection)',
    color: 'var(--cm-fg)',
  },
  '.cm-panels': { backgroundColor: 'var(--cm-tooltip-bg)', color: 'var(--cm-fg)' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--danger)',
    textUnderlineOffset: '3px',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--warning)',
    textUnderlineOffset: '3px',
  },
})

/** Severity is never communicated by colour alone: each row also carries its text label. */
const SEVERITY_META = {
  error: { label: '错误', Icon: CircleAlert, tone: 'text-danger' },
  warning: { label: '警告', Icon: TriangleAlert, tone: 'text-warning' },
  info: { label: '提示', Icon: Info, tone: 'text-muted-foreground' },
  hint: { label: '建议', Icon: Info, tone: 'text-muted-foreground' },
} as const

export const AnyWorkflowEditor = forwardRef<AnyWorkflowEditorHandle, AnyWorkflowEditorProps>(
  function AnyWorkflowEditor(
    { value, onChange, onSave, readOnly = false, className },
    ref,
  ) {
    const shellRef = useRef<HTMLDivElement | null>(null)
    const mountRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)
    const viewportFrameRef = useRef<number | null>(null)
    const valueRef = useRef(value)
    const changeRef = useRef(onChange)
    const saveRef = useRef(onSave)
    const copiedTimerRef = useRef<number | null>(null)

    const [fullscreen, setFullscreen] = useState(false)
    const [status, setStatus] = useState<EditorStatus>(EMPTY_STATUS)
    const [issues, setIssues] = useState<EditorIssue[]>([])
    const [issuesOpen, setIssuesOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    changeRef.current = onChange
    saveRef.current = onSave

    const issueErrors = issues.filter((issue) => issue.severity === 'error').length
    const issueWarnings = issues.filter((issue) => issue.severity === 'warning').length
    const issueHints = issues.length - issueErrors - issueWarnings

    useEffect(() => {
      const mount = mountRef.current
      if (!mount || viewRef.current) return

      const syncStatus = (state: EditorState) => {
        const selection = state.selection.main
        const line = state.doc.lineAt(selection.head)
        const next: EditorStatus = {
          canUndo: undoDepth(state) > 0,
          canRedo: redoDepth(state) > 0,
          line: line.number,
          column: selection.head - line.from + 1,
          selected: Math.abs(selection.to - selection.from),
          chars: state.doc.length,
          lines: state.doc.lines,
        }
        setStatus((prev) =>
          prev.canUndo === next.canUndo &&
          prev.canRedo === next.canRedo &&
          prev.line === next.line &&
          prev.column === next.column &&
          prev.selected === next.selected &&
          prev.chars === next.chars &&
          prev.lines === next.lines
            ? prev
            : next,
        )
      }

      const syncIssues = (state: EditorState) => {
        const next: EditorIssue[] = []
        forEachDiagnostic(state, (diagnostic, from, to) => {
          next.push({
            from,
            to,
            line: state.doc.lineAt(from).number,
            severity: diagnostic.severity,
            message: diagnostic.message,
          })
        })
        setIssues((prev) => (sameIssues(prev, next) ? prev : next))
      }

      const extensions = [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        anyWorkflowLanguage,
        syntaxHighlighting(anyWorkflowHighlightStyle),
        autocompletion({ override: [anyWorkflowCompletion], activateOnTyping: true, icons: true }),
        linter((view) => validateAnyWorkflowSource(view.state.doc.toString()), { delay: 200 }),
        editorTheme,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString()
            if (next !== valueRef.current) {
              valueRef.current = next
              changeRef.current(next)
            }
          }
          // Runs for selection and lint-result transactions too, so the status bar and the issue
          // panel stay in step with what the editor is actually showing.
          syncStatus(update.state)
          syncIssues(update.state)
        }),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              saveRef.current?.()
              return true
            },
          },
          indentWithTab,
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...lintKeymap,
          ...foldKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
      ]

      // CodeMirror owns its internal DOM. Mount one EditorView into a stable parent and let
      // transactions drive all document changes; the surrounding shell only controls layout.
      const view = new EditorView({
        doc: valueRef.current,
        extensions,
        parent: mount,
      })
      viewRef.current = view
      syncStatus(view.state)
      syncIssues(view.state)
      return () => {
        view.destroy()
        viewRef.current = null
      }
    }, [readOnly])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (current === value) {
        valueRef.current = value
        return
      }
      valueRef.current = value
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }, [value])

    useEffect(() => {
      if (!copied) return
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
      return () => {
        if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
      }
    }, [copied])

    useEffect(() => {
      if (!fullscreen) return
      /**
       * Capture phase on purpose: this has to decide *before* CodeMirror and Radix see the key.
       * Anything the editor already has open — the search panel, the completion popup — owns the
       * first Escape. Checking `defaultPrevented` instead would never fire, because an open
       * tooltip (including the one on the fullscreen button itself) calls preventDefault.
       */
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        if (document.querySelector('.aw-code-editor .cm-tooltip, .aw-code-editor .cm-panels')) return
        setFullscreen(false)
      }
      document.addEventListener('keydown', onKeyDown, true)
      // Lock both elements: the page scrollbar lives on <html>, so hiding it on <body> alone
      // leaves a strip beside the fullscreen surface.
      const previousHtmlOverflow = document.documentElement.style.overflow
      const previousBodyOverflow = document.body.style.overflow
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      viewRef.current?.focus()
      return () => {
        document.removeEventListener('keydown', onKeyDown, true)
        document.documentElement.style.overflow = previousHtmlOverflow
        document.body.style.overflow = previousBodyOverflow
      }
    }, [fullscreen])

    useEffect(() => {
      const viewport = window.visualViewport
      if (!viewport) return

      const syncViewport = () => {
        const shell = shellRef.current
        if (fullscreen && shell) {
          // A fixed element sized with 100dvh can still sit behind Android's virtual keyboard.
          // VisualViewport reports the actually visible area, including keyboard/browser chrome.
          shell.style.top = `${viewport.offsetTop}px`
          shell.style.height = `${viewport.height}px`
        }

        if (viewportFrameRef.current !== null) window.cancelAnimationFrame(viewportFrameRef.current)
        viewportFrameRef.current = window.requestAnimationFrame(() => {
          viewportFrameRef.current = null
          const view = viewRef.current
          if (!view?.hasFocus) return
          view.dispatch({
            effects: EditorView.scrollIntoView(view.state.selection.main.head, {
              y: 'nearest',
              yMargin: 56,
            }),
          })
        })
      }

      syncViewport()
      viewport.addEventListener('resize', syncViewport)
      viewport.addEventListener('scroll', syncViewport)
      return () => {
        viewport.removeEventListener('resize', syncViewport)
        viewport.removeEventListener('scroll', syncViewport)
        if (viewportFrameRef.current !== null) {
          window.cancelAnimationFrame(viewportFrameRef.current)
          viewportFrameRef.current = null
        }
        const shell = shellRef.current
        shell?.style.removeProperty('top')
        shell?.style.removeProperty('height')
      }
    }, [fullscreen])

    const insert = useCallback((text: string, cursorOffset?: number, selectionLength = 0) => {
      const view = viewRef.current
      if (!view) return
      const selection = view.state.selection.main
      const offset = Math.max(0, Math.min(cursorOffset ?? text.length, text.length))
      const anchor = selection.from + offset
      const head = anchor + Math.max(0, Math.min(selectionLength, text.length - offset))
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor, head },
        scrollIntoView: true,
      })
      view.focus()
    }, [])

    const insertStructured = useCallback((kind: StructuredInsertKind) => {
      const view = viewRef.current
      if (!view) return
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
        selection: { anchor },
        scrollIntoView: true,
      })
      view.focus()
    }, [])

    const runSmartDelete = useCallback(() => {
      const view = viewRef.current
      if (!view) return
      const selection = view.state.selection.main
      const plan = planSmartDelete(view.state.doc.toString(), selection.from, selection.to)
      if (!plan.ok) {
        toast.info(plan.message)
        view.focus()
        return
      }

      view.dispatch({
        changes: { from: plan.from, to: plan.to, insert: '' },
        selection: { anchor: plan.from },
        scrollIntoView: true,
      })
      toast.success(plan.message)
      view.focus()
    }, [])

    const runUndo = useCallback(() => {
      const view = viewRef.current
      if (!view) return
      undo(view)
      view.focus()
    }, [])

    const runRedo = useCallback(() => {
      const view = viewRef.current
      if (!view) return
      redo(view)
      view.focus()
    }, [])

    const runFormat = useCallback(() => {
      const view = viewRef.current
      if (!view) return
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
        selection: { anchor },
        scrollIntoView: true,
      })
      view.focus()
    }, [])

    const revealRange = useCallback((from: number, to: number) => {
      const view = viewRef.current
      if (!view) return
      const max = view.state.doc.length
      const start = Math.max(0, Math.min(from, max))
      const end = Math.max(start, Math.min(to, max))
      view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true })
      view.focus()
    }, [])

    const runCopy = useCallback(async () => {
      const text = viewRef.current?.state.doc.toString() ?? ''
      if (!text) return
      const ok = await writeClipboard(text)
      if (ok) {
        setCopied(true)
        toast.success('已复制工作流')
      } else {
        toast.error('复制失败', { description: '浏览器拒绝了剪贴板写入，请手动选择后复制。' })
      }
    }, [])

    const runPaste = useCallback(async () => {
      try {
        const text = await readClipboard()
        if (!text) {
          toast.info('剪贴板为空')
          return
        }
        insert(text)
        toast.success('已粘贴到光标位置')
      } catch {
        toast.error('无法读取剪贴板', { description: '请允许浏览器访问剪贴板，或使用系统粘贴快捷键。' })
      }
    }, [insert])

    const insertVariableReference = useCallback(() => {
      const view = viewRef.current
      if (!view) return
      const selection = view.state.selection.main
      const from = selection.from
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: '%%' },
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

    useImperativeHandle(
      ref,
      () => ({
        focus: () => viewRef.current?.focus(),
        insert,
        undo: runUndo,
        redo: runRedo,
        format: runFormat,
        complete() {
          const view = viewRef.current
          if (view) {
            view.focus()
            startCompletion(view)
          }
        },
        reveal: revealRange,
        getSource: () => viewRef.current?.state.doc.toString() ?? '',
      }),
      [insert, runUndo, runRedo, runFormat, revealRange],
    )

    const issueParts: string[] = []
    if (issueErrors > 0) issueParts.push(`${issueErrors} 个错误`)
    if (issueWarnings > 0) issueParts.push(`${issueWarnings} 个警告`)
    if (issueHints > 0) issueParts.push(`${issueHints} 条提示`)
    const issueSummary = issueParts.length ? issueParts.join(' · ') : '无问题'

    return (
      <TooltipProvider delayDuration={300}>
        <div
          ref={shellRef}
          data-fullscreen={fullscreen ? 'true' : undefined}
          className={cn(
            'aw-editor-shell flex flex-col overflow-hidden border border-cm-border bg-cm-bg',
            fullscreen
              ? 'fixed inset-x-0 top-0 z-50 h-[100dvh] rounded-none'
              : 'h-[min(64dvh,840px)] min-h-[280px] rounded-lg sm:h-[clamp(560px,70dvh,760px)]',
            !fullscreen && className,
          )}
        >
          <EditorToolbar
            readOnly={readOnly}
            canUndo={status.canUndo}
            canRedo={status.canRedo}
            copied={copied}
            fullscreen={fullscreen}
            onInsertStructured={insertStructured}
            onInsert={insert}
            onInsertVariable={insertVariableReference}
            onSmartDelete={runSmartDelete}
            onUndo={runUndo}
            onRedo={runRedo}
            onPaste={runPaste}
            onFormat={runFormat}
            onSave={onSave ? () => saveRef.current?.() : undefined}
            onCopy={runCopy}
            onToggleFullscreen={() => setFullscreen((prev) => !prev)}
          />

          <div ref={mountRef} className="aw-code-editor min-h-0 flex-1 overflow-hidden" />

          {issuesOpen ? (
            <div className="max-h-56 shrink-0 overflow-y-auto border-t border-cm-border bg-cm-toolbar-bg">
              {issues.length === 0 ? (
                <p className="px-2.5 py-3 text-[11px] text-muted-foreground">没有发现问题。</p>
              ) : (
                <ul className="divide-y divide-cm-border">
                  {issues.map((issue, index) => {
                    const meta = SEVERITY_META[issue.severity]
                    return (
                      <li key={`${issue.from}-${issue.line}-${index}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-muted/50"
                          onClick={() => revealRange(issue.from, issue.to)}
                        >
                          <meta.Icon className={cn('mt-0.5 size-3.5 shrink-0', meta.tone)} aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-medium">
                              {meta.label} · 第 {issue.line} 行
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
                              {issue.message}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-cm-border bg-cm-toolbar-bg px-2.5 py-1.5 text-[10px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                行 {status.line}，列 {status.column}
              </span>
              {status.selected > 0 ? <span>已选 {status.selected}</span> : null}
              <span>
                {status.chars} 字符 · {status.lines} 行
              </span>
              <span className="hidden xl:inline">Ctrl/⌘ S 保存 · Ctrl/⌘ Z 撤销</span>
            </div>

            <button
              type="button"
              onClick={() => setIssuesOpen((prev) => !prev)}
              aria-expanded={issuesOpen}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted/60',
                issueErrors > 0 && 'text-danger',
              )}
            >
              {issueErrors > 0 ? (
                <CircleAlert className="size-3.5" aria-hidden="true" />
              ) : issueWarnings > 0 ? (
                <TriangleAlert className="size-3.5 text-warning" aria-hidden="true" />
              ) : (
                <Check className="size-3.5" aria-hidden="true" />
              )}
              <span>{issueSummary}</span>
              {issuesOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>

        </div>
      </TooltipProvider>
    )
  },
)
