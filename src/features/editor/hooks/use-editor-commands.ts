import { useCallback } from 'react'
import type { EditorView } from '@codemirror/view'
import type { RefObject } from 'react'
import { editorCommand, type CommandOutcome, type EditorCommandId } from '../lib/editor-command-registry'
import type { EditorFocus } from './use-editor-focus'

/**
 * Runs registry commands against the mounted view. Edits are refused on read-only editors,
 * outcomes go to `report` (the shell shows them as toasts), and focus follows `focus.restore`.
 */
export function useEditorCommands(
  viewRef: RefObject<EditorView | null>,
  focus: EditorFocus,
  report: (outcome: CommandOutcome) => void,
) {
  const runWith = useCallback(
    async (action: (view: EditorView) => CommandOutcome | Promise<CommandOutcome>, edits: boolean) => {
      const view = viewRef.current
      if (!view || (edits && view.state.readOnly)) return null
      const outcome = await action(view)
      // The view may have been replaced while an async command (clipboard) was waiting.
      if (viewRef.current !== view) return null
      report(outcome)
      focus.restore()
      return outcome
    },
    [viewRef, focus, report],
  )

  const run = useCallback(
    (id: EditorCommandId) => {
      const command = editorCommand(id)
      return runWith(command.run, command.edits)
    },
    [runWith],
  )

  return { run, runWith }
}
