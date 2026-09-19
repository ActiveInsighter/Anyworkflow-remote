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
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { forEachDiagnostic, lintGutter, linter, lintKeymap, type Diagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import {
  AlignLeft,
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  Download,
  FileCode2,
  Info,
  Link as LinkIcon,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Redo2,
  Repeat,
  Search,
  TriangleAlert,
  Undo2,
  Variable,
  Zap,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  anyWorkflowCompletion,
  anyWorkflowHighlightStyle,
  anyWorkflowLanguage,
  formatAnyWorkflowSource,
  validateAnyWorkflowSource,
} from '@/components/editor/anyworkflow-dsl'
import { cn } from '@/lib/utils'

export interface AnyWorkflowEditorHandle {
  focus: () => void
  insert: (text: string, cursorOffset?: number) => void
  complete: () => void
  search: () => void
  undo: () => void
  redo: () => void
  format: () => void
  /** Selects a range so the offending line is visibly marked, then scrolls to it. */
  reveal: (from: number, to: number) => void
  getSource: () => string
}

export interface EditorIssue {
  from: number
  to: number
  line: number
  severity: Diagnostic['severity']
  message: string
}

interface AnyWorkflowEditorProps {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  readOnly?: boolean
  /** Filename used by the download action. */
  downloadName?: string
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
    minHeight: 'min(62vh, 680px)',
    backgroundColor: 'var(--cm-bg)',
    color: 'var(--cm-fg)',
    fontSize: '14px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: '"SFMono-Regular", "Cascadia Code", Consolas, "Liberation Mono", monospace',
    lineHeight: '1.7',
  },
  '.cm-content': { padding: '12px 0 28px', caretColor: 'var(--cm-caret)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': {
    backgroundColor: 'var(--cm-gutter-bg)',
    color: 'var(--cm-gutter-fg)',
    borderRight: '1px solid var(--cm-border)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line)' },
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
  '.cm-panel.cm-search': { padding: '8px' },
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

/** Clipboard access needs a secure context and can still be refused; fall back before failing. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Line/column offsets survive formatting because the formatter never adds or removes lines. */
function offsetForLineColumn(text: string, lineNumber: number, column: number): number {
  const lines = text.split('\n')
  const index = Math.max(0, Math.min(lineNumber - 1, lines.length - 1))
  let offset = 0
  for (let i = 0; i < index; i += 1) offset += lines[i].length + 1
  return offset + Math.max(0, Math.min(column - 1, lines[index].length))
}

function sameIssues(a: EditorIssue[], b: EditorIssue[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].from !== b[i].from || a[i].to !== b[i].to || a[i].message !== b[i].message) return false
  }
  return true
}

/** Severity is never communicated by colour alone: each row also carries its text label. */
const SEVERITY_META = {
  error: { label: '错误', Icon: CircleAlert, tone: 'text-danger' },
  warning: { label: '警告', Icon: TriangleAlert, tone: 'text-warning' },
  info: { label: '提示', Icon: Info, tone: 'text-muted-foreground' },
  hint: { label: '建议', Icon: Info, tone: 'text-muted-foreground' },
} as const

/**
 * Toolbar control. Labels are shown from `lg` upward; below that the icon carries the meaning and
 * the tooltip plus `aria-label` keep it discoverable. Height drops to the mobile touch target only
 * where the header can still wrap without pushing the editor off screen.
 */
function ToolButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  showLabel = false,
  className,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
  disabled?: boolean
  showLabel?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn('h-10 min-w-10 gap-1 px-2 text-[11px] font-medium sm:h-7 sm:min-w-7', className)}
        >
          {icon}
          {showLabel ? <span className="hidden xl:inline">{label}</span> : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint ? `${label} · ${hint}` : label}</TooltipContent>
    </Tooltip>
  )
}

function ToolDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-cm-border" aria-hidden="true" />
}

export const AnyWorkflowEditor = forwardRef<AnyWorkflowEditorHandle, AnyWorkflowEditorProps>(
  function AnyWorkflowEditor(
    { value, onChange, onSave, readOnly = false, downloadName = 'plan.aw' },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)
    const valueRef = useRef(value)
    const changeRef = useRef(onChange)
    const saveRef = useRef(onSave)
    const copiedTimerRef = useRef<number | null>(null)

    const [fullscreen, setFullscreen] = useState(false)
    const [status, setStatus] = useState<EditorStatus>(EMPTY_STATUS)
    const [issues, setIssues] = useState<EditorIssue[]>([])
    const [issuesOpen, setIssuesOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const [notice, setNotice] = useState('')

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

      const state = EditorState.create({
        doc: valueRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
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
          lintGutter(),
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
            ...searchKeymap,
            ...lintKeymap,
            ...foldKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
        ],
      })

      const view = new EditorView({ state, parent: mount })
      viewRef.current = view
      syncStatus(state)
      syncIssues(state)
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
      if (!notice) return
      const timer = window.setTimeout(() => setNotice(''), 3200)
      return () => window.clearTimeout(timer)
    }, [notice])

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

    const insert = useCallback((text: string, cursorOffset?: number) => {
      const view = viewRef.current
      if (!view) return
      const selection = view.state.selection.main
      const offset = cursorOffset ?? text.length
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + Math.max(0, Math.min(offset, text.length)) },
        scrollIntoView: true,
      })
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
        setNotice('格式已经整齐了')
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
      if (ok) setCopied(true)
      else setNotice('浏览器拒绝了剪贴板写入，请手动选择后复制')
    }, [])

    const runDownload = useCallback(() => {
      const text = viewRef.current?.state.doc.toString() ?? ''
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    }, [downloadName])

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
        search() {
          const view = viewRef.current
          if (view) {
            view.focus()
            openSearchPanel(view)
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
          data-fullscreen={fullscreen ? 'true' : undefined}
          className={cn(
            'aw-editor-shell flex flex-col overflow-hidden border border-cm-border bg-cm-bg',
            fullscreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-lg',
          )}
        >
          <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-cm-border bg-cm-toolbar-bg px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mr-1 hidden items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground xl:flex">
              <FileCode2 className="size-3.5" />
              Run DSL
            </div>

            {readOnly ? null : (
              <>
                <ToolButton
                  icon={<Braces className="size-3.5" />}
                  label="任务"
                  hint="插入 @task 任务块"
                  showLabel
                  onClick={() => insert('@task 任务名 {\n  @mode=serial\n\n  \n}\n', 6)}
                />
                <ToolButton
                  icon={<Zap className="size-3.5" />}
                  label="执行单元"
                  hint="插入 @event 执行单元"
                  showLabel
                  onClick={() => insert('@event 执行单元 {\n  ```\n\n  ```\n}\n', 7)}
                />
                <ToolButton
                  icon={<Repeat className="size-3.5" />}
                  label="循环"
                  hint="插入 @for 循环块"
                  showLabel
                  onClick={() => insert('@for i in range(1, 3) {\n  \n}\n', 29)}
                />
                <ToolButton
                  icon={<Variable className="size-3.5" />}
                  label="变量"
                  hint="插入 @var 变量声明"
                  showLabel
                  onClick={() => insert('@var name=value', 5)}
                />
                <ToolButton
                  icon={<MessageSquareText className="size-3.5" />}
                  label="文本块"
                  hint="插入 ``` 原样文本块"
                  showLabel
                  onClick={() => insert('```\n\n```', 4)}
                />
                <ToolButton
                  icon={<LinkIcon className="size-3.5" />}
                  label="链接"
                  hint="插入 <https://> 打开页面指令"
                  showLabel
                  onClick={() => insert('<https://>', 9)}
                />
                <ToolDivider />
              </>
            )}

            <div className="ms-auto flex shrink-0 items-center gap-0.5">
              {readOnly ? null : (
                <>
                  <ToolButton
                    icon={<Undo2 className="size-3.5" />}
                    label="撤销"
                    hint="Ctrl/⌘ Z"
                    onClick={runUndo}
                    disabled={!status.canUndo}
                  />
                  <ToolButton
                    icon={<Redo2 className="size-3.5" />}
                    label="重做"
                    hint="Ctrl/⌘ Shift Z"
                    onClick={runRedo}
                    disabled={!status.canRedo}
                  />
                  <ToolDivider />
                  <ToolButton
                    icon={<AlignLeft className="size-3.5" />}
                    label="格式化"
                    hint="按块结构重排缩进"
                    onClick={runFormat}
                  />
                </>
              )}
              <ToolButton
                icon={<Search className="size-3.5" />}
                label="查找"
                hint="Ctrl/⌘ F"
                onClick={() => {
                  const view = viewRef.current
                  if (!view) return
                  view.focus()
                  openSearchPanel(view)
                }}
              />
              <ToolButton
                icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                label={copied ? '已复制' : '复制'}
                hint="复制全文"
                onClick={() => void runCopy()}
              />
              <ToolButton
                icon={<Download className="size-3.5" />}
                label="下载"
                hint={`保存为 ${downloadName}`}
                onClick={runDownload}
              />
              <ToolDivider />
              <ToolButton
                icon={fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                label={fullscreen ? '退出全屏' : '全屏'}
                hint="Esc 退出"
                onClick={() => setFullscreen((prev) => !prev)}
              />
            </div>
          </div>

          <div ref={mountRef} className="aw-code-editor min-h-0" />

          {notice ? (
            <p role="status" className="shrink-0 border-t border-cm-border bg-cm-toolbar-bg px-2.5 py-1.5 text-[11px] text-muted-foreground">
              {notice}
            </p>
          ) : null}

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
              <span className="hidden xl:inline">Ctrl/⌘ S 保存 · Ctrl/⌘ Z 撤销 · Ctrl/⌘ F 查找</span>
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
