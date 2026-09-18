import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  startCompletion,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintGutter, linter, lintKeymap } from '@codemirror/lint'
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
import { Braces, Search, Sparkles, Variable } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  anyWorkflowCompletion,
  anyWorkflowHighlightStyle,
  anyWorkflowLanguage,
  PROMPT_TEMPLATES,
  validateAnyWorkflowSource,
} from '@/components/editor/anyworkflow-dsl'

export interface AnyWorkflowEditorHandle {
  focus: () => void
  insert: (text: string, cursorOffset?: number) => void
  complete: () => void
  search: () => void
}

interface AnyWorkflowEditorProps {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  readOnly?: boolean
}

const editorTheme = EditorView.theme({
  '&': {
    minHeight: '360px',
    backgroundColor: 'var(--cm-bg)',
    color: 'var(--cm-fg)',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: '"SFMono-Regular", "Cascadia Code", Consolas, "Liberation Mono", monospace',
    lineHeight: '1.7',
  },
  '.cm-content': { padding: '12px 0 24px', caretColor: 'var(--cm-caret)' },
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
    borderRadius: '8px',
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

function PromptPalette({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  onInsert: (value: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>提示词</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {PROMPT_TEMPLATES.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              className="rounded-lg border p-3 text-left transition-colors hover:bg-muted"
              onClick={() => {
                onInsert(prompt.text)
                onOpenChange(false)
              }}
            >
              <div className="text-sm font-semibold">{prompt.label}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{prompt.text}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ToolButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onClick}>
      {children}
    </Button>
  )
}

export const AnyWorkflowEditor = forwardRef<AnyWorkflowEditorHandle, AnyWorkflowEditorProps>(
  function AnyWorkflowEditor({ value, onChange, onSave, readOnly = false }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)
    const valueRef = useRef(value)
    const changeRef = useRef(onChange)
    const saveRef = useRef(onSave)
    const [paletteOpen, setPaletteOpen] = useState(false)

    changeRef.current = onChange
    saveRef.current = onSave

    useEffect(() => {
      const mount = mountRef.current
      if (!mount || viewRef.current) return

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
            if (!update.docChanged) return
            const next = update.state.doc.toString()
            if (next === valueRef.current) return
            valueRef.current = next
            changeRef.current(next)
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

    const insert = (text: string, cursorOffset?: number) => {
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
    }

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
      insert,
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
    }), [])

    return (
      <div className="overflow-hidden rounded-xl border border-[var(--cm-border)] bg-[var(--cm-bg)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--cm-border)] bg-[var(--cm-toolbar-bg)] px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <ToolButton onClick={() => insert('@task  {\n  @mode=serial\n\n  \n}\n', 6)}>
              <Braces className="size-3.5" />Task
            </ToolButton>
            <ToolButton onClick={() => insert('@event  {\n```\n\n```\n}\n', 7)}>Event</ToolButton>
            <ToolButton onClick={() => insert('@for i in range(1, 3) {\n  \n}\n', 29)}>For</ToolButton>
            <ToolButton onClick={() => insert('@var name=value', 5)}>
              <Variable className="size-3.5" />变量
            </ToolButton>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ToolButton onClick={() => setPaletteOpen(true)}>
              <Sparkles className="size-3.5" /><span className="hidden sm:inline">提示词</span>
            </ToolButton>
            <ToolButton onClick={() => viewRef.current && openSearchPanel(viewRef.current)}>
              <Search className="size-3.5" />
            </ToolButton>
          </div>
        </div>

        <div ref={mountRef} className="aw-code-editor" />

        <div className="flex items-center gap-1 overflow-x-auto border-t border-[var(--cm-border)] bg-[var(--cm-toolbar-bg)] px-2 py-1.5 sm:hidden">
          <ToolButton onClick={() => viewRef.current && startCompletion(viewRef.current)}>补全</ToolButton>
          <ToolButton onClick={() => insert('{}', 1)}>{'{ }'}</ToolButton>
          <ToolButton onClick={() => insert('```\n\n```', 4)}>Prompt</ToolButton>
          <ToolButton onClick={() => insert('<https://>', 9)}>URL</ToolButton>
          <ToolButton onClick={() => insert('%name%', 1)}>%变量%</ToolButton>
        </div>

        <PromptPalette open={paletteOpen} onOpenChange={setPaletteOpen} onInsert={(prompt) => insert(prompt)} />
      </div>
    )
  },
)
