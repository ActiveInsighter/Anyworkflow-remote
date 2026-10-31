import { forwardRef, useImperativeHandle, type CSSProperties } from 'react'
import { Maximize2, Minimize2, PanelRight, Save } from 'lucide-react'
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { IS_APPLE_PLATFORM } from '@/lib/platform/keyboard'
import { cn } from '@/lib/utils'
import { useEditorController } from '../hooks/use-editor-controller'
import { EditorFocusProvider } from '../hooks/use-editor-focus'
import type { StartLinkOption } from '../lib/dsl-completion'
import { formatKey } from '../lib/editor-command-registry'
import { fontSizePx } from '../lib/editor-preferences'
import { EditorIssuesToggle } from './editor-issues'
import { EditorMoreMenu } from './editor-more-menu'
import { EditorSidePanel } from './editor-side-panel'
import { EditorStatusBar } from './editor-status-bar'
import { ToolIconButton } from './editor-tool-button'
import { EditorToolbar } from './editor-toolbar'
import { StartPageMenu } from './start-page-menu'

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

/**
 * AnyWorkflow DSL editor: toolbar, CodeMirror surface, side panel (outline, Act preview,
 * problems) and status bar. Behaviour lives in `useEditorController`; this component is layout.
 * Everything account-specific (start links, saving) comes from the host through props.
 */
export const AnyWorkflowEditor = forwardRef<AnyWorkflowEditorHandle, AnyWorkflowEditorProps>(function AnyWorkflowEditor(
  { value, onChange, onSave, readOnly = false, startLinks, className },
  ref,
) {
  const editor = useEditorController({ value, onChange, onSave, readOnly, startLinks: startLinks?.links })
  const { panel, status, issues, fullscreen, wide } = editor

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor.viewRef.current?.focus(),
      reveal: editor.reveal,
      revealFirstError() {
        const first = issues.find((issue) => issue.severity === 'error')
        if (!first) return false
        editor.reveal(first.from, first.to)
        if (wide) panel.show('issues')
        return true
      },
      getSource: () => editor.viewRef.current?.state.doc.toString() ?? '',
    }),
    [editor.reveal, editor.viewRef, issues, panel, wide],
  )

  const panelProps = {
    tab: panel.tab,
    onTabChange: panel.setTab,
    outline: editor.outline,
    activePath: editor.activePath,
    issues,
    preview: editor.preview,
    actCounts: editor.actCounts,
  }
  const expanded = editor.preview.eventCount ? { events: editor.preview.eventCount, acts: editor.preview.actCount } : null

  return (
    <EditorFocusProvider value={editor.focus}>
      <div
        ref={editor.shellRef}
        data-fullscreen={fullscreen ? 'true' : undefined}
        style={{ '--editor-font-size': `${fontSizePx(editor.preferences.fontSize)}px` } as CSSProperties}
        className={cn(
          'aw-editor-shell @container flex flex-col overflow-hidden border border-cm-border bg-cm-bg shadow-xs',
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
          copied={editor.copied}
          onRun={(id) => void editor.runCommand(id)}
          startPage={
            startLinks ? (
              <StartPageMenu
                links={startLinks.links}
                readState={editor.startPage.read}
                onPick={editor.startPage.pick}
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
                preferences={editor.preferences}
                onPreferencesChange={editor.updatePreferences}
                onRun={(id) => void editor.runCommand(id)}
              />
              <ToolIconButton
                label="结构"
                hint={wide ? (panel.visible ? '隐藏大纲、预览与问题' : '显示大纲、预览与问题') : '大纲、预览与问题'}
                pressed={wide ? panel.visible : undefined}
                onClick={panel.toggle}
              >
                <PanelRight aria-hidden="true" />
              </ToolIconButton>
              <ToolIconButton
                label={fullscreen ? '退出全屏' : '全屏'}
                hint={fullscreen ? '退出全屏 · Esc' : '全屏编辑'}
                onClick={editor.toggleFullscreen}
              >
                {fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              </ToolIconButton>
            </>
          }
        />
        <div className="flex min-h-0 flex-1">
          <div ref={editor.mountRef} className="aw-code-editor min-h-0 min-w-0 flex-1 overflow-hidden" />
          {panel.visible ? (
            <aside aria-label="大纲、预览与问题" className="flex w-80 shrink-0 flex-col border-s border-cm-border bg-cm-toolbar-bg">
              <EditorSidePanel
                {...panelProps}
                onRevealAt={(at) => editor.reveal(at, at)}
                onRevealRange={editor.reveal}
                onRevealLine={editor.revealLine}
              />
            </aside>
          ) : null}
        </div>
        <EditorStatusBar
          status={status}
          expanded={expanded}
          trailing={
            <EditorIssuesToggle
              issues={issues}
              open={panel.tab === 'issues' && (wide ? panel.visible : panel.sheetOpen)}
              onOpenChange={editor.setIssuesOpen}
            />
          }
        />
      </div>
      {wide ? null : (
        <Modal open={panel.sheetOpen} onOpenChange={panel.setSheetOpen}>
          <ModalContent size="sm" height="fixed">
            <ModalHeader>
              <ModalTitle>大纲、预览与问题</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <EditorSidePanel
                variant="sheet"
                {...panelProps}
                onRevealAt={panel.fromSheet((at: number) => editor.reveal(at, at))}
                onRevealRange={panel.fromSheet(editor.reveal)}
                onRevealLine={panel.fromSheet(editor.revealLine)}
              />
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </EditorFocusProvider>
  )
})
