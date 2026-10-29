import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Maximize2, Minimize2, PanelRight, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'
import { IS_APPLE_PLATFORM } from '@/lib/platform/keyboard'
import { cn } from '@/lib/utils'
import { useCodeMirror } from '../hooks/use-code-mirror'
import { useEditorCommands } from '../hooks/use-editor-commands'
import { useEditorFullscreen } from '../hooks/use-editor-fullscreen'
import { useEditorPreferences } from '../hooks/use-editor-preferences'
import type { StartLinkOption } from '../lib/dsl-completion'
import { formatKey, setTaskStartUrl, type CommandOutcome, type EditorCommandId } from '../lib/editor-command-registry'
import type { EditorConfig } from '../lib/editor-extensions'
import { fontSizePx } from '../lib/editor-preferences'
import { outlinePathAt, readOutline } from '../lib/outline'
import { taskStartUrlAt } from '../lib/start-url'
import { EditorIssuesToggle } from './editor-issues'
import { EditorMoreMenu } from './editor-more-menu'
import { EditorSidePanel, type SidePanelTab } from './editor-side-panel'
import { EditorStatusBar } from './editor-status-bar'
import { EditorToolbar } from './editor-toolbar'
import { StartPageMenu, type StartPageState } from './start-page-menu'

export type { EditorIssue } from '../lib/editor-helpers'

export interface AnyWorkflowEditorHandle {
  focus: () => void
  /** Selects a range so the offending line is visibly marked, then scrolls to it. */
  reveal: (from: number, to: number) => void
  /** Jumps to the first error and opens the problem list; false when there is none. */
  revealFirstError: () => boolean
  getSource: () => string
}

/** The host's start links; the editor never loads or stores them itself. */
export interface EditorStartLinks {
  links: readonly StartLinkOption[]
  onManage?: () => void
  onAdd?: (url: string) => void
}

interface AnyWorkflowEditorProps {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  readOnly?: boolean
  startLinks?: EditorStartLinks
  className?: string
}

const NO_LINKS: readonly StartLinkOption[] = []
/** Wide enough for the outline beside the code. */
const WIDE_QUERY = '(min-width: 1280px)'

function reportOutcome(outcome: CommandOutcome) {
  if (!outcome) return
  const options = outcome.description ? { description: outcome.description } : undefined
  if (outcome.tone === 'success') toast.success(outcome.message, options)
  else if (outcome.tone === 'error') toast.error(outcome.message, options)
  else toast.info(outcome.message, options)
}

function ToolIconButton({
  label,
  hint,
  pressed,
  onClick,
  className,
  children,
}: {
  label: string
  hint: string
  pressed?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn('h-touch min-w-9 flex-1 shrink-0 aria-pressed:bg-muted sm:size-8 sm:min-w-0 sm:flex-none', className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  )
}

/**
 * AnyWorkflow DSL editor: toolbar, CodeMirror surface, outline and problems, status bar.
 * Everything account-specific (start links, saving) comes from the host through props.
 */
export const AnyWorkflowEditor = forwardRef<AnyWorkflowEditorHandle, AnyWorkflowEditorProps>(function AnyWorkflowEditor(
  { value, onChange, onSave, readOnly = false, startLinks, className },
  ref,
) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [preferences, updatePreferences] = useEditorPreferences()
  const wide = useMediaQuery(WIDE_QUERY)
  const [tab, setTab] = useState<SidePanelTab>('outline')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)

  const links = startLinks?.links ?? NO_LINKS
  const config = useMemo<EditorConfig>(
    () => ({ readOnly, startLinks: links, lineNumbers: preferences.lineNumbers, lineWrap: preferences.lineWrap }),
    [readOnly, links, preferences.lineNumbers, preferences.lineWrap],
  )
  const { mountRef, viewRef, status, issues } = useCodeMirror({ value, onChange, onSave, onOutcome: reportOutcome, config })
  const { fullscreen, toggleFullscreen } = useEditorFullscreen(shellRef, viewRef)
  const commands = useEditorCommands(viewRef, reportOutcome)

  // The outline lags typing slightly rather than slowing it down.
  const deferredValue = useDeferredValue(value)
  const outline = useMemo(() => readOutline(deferredValue), [deferredValue])
  const activePath = useMemo(() => outlinePathAt(outline, status.head), [outline, status.head])
  const panelVisible = wide && preferences.panel

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    },
    [],
  )

  const runCommand = useCallback(
    async (id: EditorCommandId) => {
      const outcome = await commands.run(id)
      if (id === 'clipboard.copy' && outcome?.tone === 'success') {
        setCopied(true)
        if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1800)
      }
    },
    [commands],
  )

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

  const showPanel = useCallback(
    (next: SidePanelTab) => {
      setTab(next)
      if (wide) updatePreferences({ panel: true })
      else setSheetOpen(true)
    },
    [wide, updatePreferences],
  )

  const revealFromSheet = (from: number, to = from) => {
    setSheetOpen(false)
    // Let the sheet release focus before the editor takes it.
    window.setTimeout(() => reveal(from, to), 0)
  }

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      reveal,
      revealFirstError() {
        const first = issues.find((issue) => issue.severity === 'error')
        if (!first) return false
        reveal(first.from, first.to)
        if (wide) showPanel('issues')
        return true
      },
      getSource: () => viewRef.current?.state.doc.toString() ?? '',
    }),
    [issues, reveal, showPanel, viewRef, wide],
  )

  const readStartPage = (): StartPageState => {
    const view = viewRef.current
    if (!view) return { inTask: false, url: null }
    const found = taskStartUrlAt(view.state.doc.toString(), view.state.selection.main.head)
    return { inTask: Boolean(found), url: found?.declaration?.value ?? null }
  }

  const panelProps = {
    tab,
    onTabChange: setTab,
    outline,
    activePath,
    issues,
  }

  return (
    <>
      <div
        ref={shellRef}
        data-fullscreen={fullscreen ? 'true' : undefined}
        style={{ '--editor-font-size': `${fontSizePx(preferences.fontSize)}px` } as CSSProperties}
        className={cn(
          'aw-editor-shell @container flex flex-col overflow-hidden border border-cm-border bg-cm-bg',
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
          copied={copied}
          onRun={(id) => void runCommand(id)}
          startPage={
            startLinks ? (
              <StartPageMenu
                links={links}
                readState={readStartPage}
                onPick={(url) => void commands.runWith((view) => setTaskStartUrl(view, url), true)}
                onAddLink={startLinks.onAdd}
                onManage={startLinks.onManage}
              />
            ) : null
          }
          trailing={
            <>
              {onSave && !readOnly ? (
                <ToolIconButton
                  label="保存"
                  hint={`保存 · ${formatKey('Mod-s', IS_APPLE_PLATFORM)}`}
                  onClick={onSave}
                  // Phones have 保存 in the page's action bar, except while fullscreen covers it.
                  className={fullscreen ? undefined : 'max-sm:hidden'}
                >
                  <Save aria-hidden="true" />
                </ToolIconButton>
              ) : null}
              <EditorMoreMenu
                readOnly={readOnly}
                preferences={preferences}
                onPreferencesChange={updatePreferences}
                onRun={(id) => void runCommand(id)}
              />
              <ToolIconButton
                label="结构"
                hint={wide ? (panelVisible ? '隐藏大纲与问题' : '显示大纲与问题') : '大纲与问题'}
                pressed={wide ? panelVisible : undefined}
                onClick={() => (wide ? updatePreferences({ panel: !preferences.panel }) : showPanel('outline'))}
              >
                <PanelRight aria-hidden="true" />
              </ToolIconButton>
              <ToolIconButton
                label={fullscreen ? '退出全屏' : '全屏'}
                hint={fullscreen ? '退出全屏 · Esc' : '全屏编辑'}
                onClick={toggleFullscreen}
              >
                {fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              </ToolIconButton>
            </>
          }
        />
        <div className="flex min-h-0 flex-1">
          <div ref={mountRef} className="aw-code-editor min-h-0 min-w-0 flex-1 overflow-hidden" />
          {panelVisible ? (
            <aside aria-label="大纲与问题" className="flex w-72 shrink-0 flex-col border-s border-cm-border bg-cm-toolbar-bg">
              <EditorSidePanel {...panelProps} onRevealAt={(at) => reveal(at, at)} onRevealRange={reveal} />
            </aside>
          ) : null}
        </div>
        <EditorStatusBar
          status={status}
          trailing={
            <EditorIssuesToggle
              issues={issues}
              open={tab === 'issues' && (wide ? panelVisible : sheetOpen)}
              onOpenChange={(open) => {
                if (open) showPanel('issues')
                else if (wide) setTab('outline')
                else setSheetOpen(false)
              }}
            />
          }
        />
      </div>
      {wide ? null : (
        <Modal open={sheetOpen} onOpenChange={(open) => setSheetOpen(open)}>
          <ModalContent size="sm" height="fixed">
            <ModalHeader>
              <ModalTitle>大纲与问题</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <EditorSidePanel variant="sheet" {...panelProps} onRevealAt={(at) => revealFromSheet(at)} onRevealRange={revealFromSheet} />
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </>
  )
})
