import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMediaQuery } from '@/hooks/use-media-query'
import { inspectWorkflowSourceCached } from '@/lib/workflow-dsl'
import { actCountsByLine, readActPreview } from '../lib/act-preview'
import type { StartLinkOption } from '../lib/dsl-completion'
import { setTaskStartUrl, type CommandOutcome, type EditorCommandId } from '../lib/editor-command-registry'
import type { EditorConfig } from '../lib/editor-extensions'
import { outlinePathAt, readOutline } from '../lib/outline'
import { taskStartUrlAt } from '../lib/start-url'
import type { SidePanelTab } from '../components/editor-side-panel'
import type { StartPageState } from '../components/start-page-menu'
import { useCodeMirror } from './use-code-mirror'
import { useEditorCommands } from './use-editor-commands'
import { useEditorFocusPolicy } from './use-editor-focus'
import { useEditorFullscreen } from './use-editor-fullscreen'
import { useEditorPreferences } from './use-editor-preferences'

const NO_LINKS: readonly StartLinkOption[] = []
/** Wide enough for the side panel beside the code. */
const WIDE_QUERY = '(min-width: 1280px)'
const COPIED_MS = 1800

function reportOutcome(outcome: CommandOutcome) {
  if (!outcome) return
  const options = outcome.description ? { description: outcome.description } : undefined
  if (outcome.tone === 'success') toast.success(outcome.message, options)
  else if (outcome.tone === 'error') toast.error(outcome.message, options)
  else toast.info(outcome.message, options)
}

/**
 * Everything the editor shell does, without its markup: the CodeMirror view, commands and their
 * focus policy, fullscreen, the side panel (outline, Act preview, problems) and navigation.
 * Derived views of the text (outline, inspection) lag typing slightly rather than slowing it down.
 */
export function useEditorController({
  value,
  onChange,
  onSave,
  readOnly,
  startLinks,
}: {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  readOnly: boolean
  startLinks?: readonly StartLinkOption[]
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [preferences, updatePreferences] = useEditorPreferences()
  const wide = useMediaQuery(WIDE_QUERY)
  const [tab, setTab] = useState<SidePanelTab>('outline')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)

  const links = startLinks ?? NO_LINKS
  const config = useMemo<EditorConfig>(
    () => ({ readOnly, startLinks: links, lineNumbers: preferences.lineNumbers, lineWrap: preferences.lineWrap }),
    [readOnly, links, preferences.lineNumbers, preferences.lineWrap],
  )
  const { mountRef, viewRef, status, issues } = useCodeMirror({ value, onChange, onSave, onOutcome: reportOutcome, config })
  const focus = useEditorFocusPolicy(viewRef)
  const { fullscreen, toggleFullscreen } = useEditorFullscreen(shellRef, viewRef)
  const commands = useEditorCommands(viewRef, focus, reportOutcome)

  const deferredValue = useDeferredValue(value)
  const outline = useMemo(() => readOutline(deferredValue), [deferredValue])
  const activePath = useMemo(() => outlinePathAt(outline, status.head), [outline, status.head])
  const inspection = useMemo(() => inspectWorkflowSourceCached(deferredValue), [deferredValue])
  const actCounts = useMemo(() => actCountsByLine(inspection), [inspection])
  const preview = useMemo(() => readActPreview(inspection, deferredValue, status.head), [inspection, deferredValue, status.head])
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
        copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
      }
    },
    [commands],
  )

  /** Selects a range so it is visibly marked, then scrolls to it. */
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

  const revealLine = useCallback(
    (line: number) => {
      const view = viewRef.current
      if (!view) return
      const at = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines))).from
      reveal(at, at)
    },
    [reveal, viewRef],
  )

  const showPanel = useCallback(
    (next: SidePanelTab) => {
      setTab(next)
      if (wide) updatePreferences({ panel: true })
      else setSheetOpen(true)
    },
    [wide, updatePreferences],
  )

  const togglePanel = useCallback(() => {
    if (wide) updatePreferences({ panel: !preferences.panel })
    else showPanel(tab)
  }, [wide, preferences.panel, showPanel, tab, updatePreferences])

  /** Navigation from the phone sheet: let the sheet release focus before the editor takes it. */
  const fromSheet = useCallback(<A extends unknown[]>(go: (...args: A) => void) => {
    return (...args: A) => {
      setSheetOpen(false)
      window.setTimeout(() => go(...args), 0)
    }
  }, [])

  const setIssuesOpen = useCallback(
    (open: boolean) => {
      if (open) showPanel('issues')
      else if (wide) setTab('outline')
      else setSheetOpen(false)
    },
    [showPanel, wide],
  )

  const readStartPage = useCallback((): StartPageState => {
    const view = viewRef.current
    if (!view) return { inTask: false, url: null }
    const found = taskStartUrlAt(view.state.doc.toString(), view.state.selection.main.head)
    return { inTask: Boolean(found), url: found?.declaration?.value ?? null }
  }, [viewRef])

  const pickStartPage = useCallback(
    (url: string) => void commands.runWith((view) => setTaskStartUrl(view, url), true),
    [commands],
  )

  return {
    shellRef,
    mountRef,
    viewRef,
    focus,
    preferences,
    updatePreferences,
    wide,
    status,
    issues,
    fullscreen,
    toggleFullscreen,
    copied,
    runCommand,
    reveal,
    revealLine,
    panel: { tab, setTab, visible: panelVisible, sheetOpen, setSheetOpen, show: showPanel, toggle: togglePanel, fromSheet },
    setIssuesOpen,
    outline,
    activePath,
    preview,
    actCounts,
    startPage: { read: readStartPage, pick: pickStartPage },
  }
}

export type EditorController = ReturnType<typeof useEditorController>
