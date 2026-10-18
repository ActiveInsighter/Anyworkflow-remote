import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { linter, lintKeymap } from '@codemirror/lint'
import { highlightSelectionMatches } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
  type ViewUpdate,
} from '@codemirror/view'
import {
  anyWorkflowCompletion,
  anyWorkflowHighlightStyle,
  anyWorkflowLanguage,
  isStartUrlValuePosition,
  validateAnyWorkflowSource,
} from './anyworkflow-dsl'
import { editorTheme } from './editor-theme'

/** The full AnyWorkflow editing setup: language, lint, completion, history and keymaps. */
export function anyWorkflowExtensions({
  readOnly,
  onUpdate,
  onSave,
}: {
  readOnly: boolean
  onUpdate: (update: ViewUpdate) => void
  onSave: () => void
}): Extension[] {
  return [
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
    // Clicking after the `=` of `@let start_url=` offers the common start links.
    EditorView.domEventHandlers({
      mouseup: (_event, view) => {
        setTimeout(() => {
          const head = view.state.selection.main.head
          const line = view.state.doc.lineAt(head)
          if (view.state.selection.main.empty && isStartUrlValuePosition(line.text.slice(0, head - line.from))) {
            startCompletion(view)
          }
        }, 0)
        return false
      },
    }),
    EditorState.readOnly.of(readOnly),
    EditorView.updateListener.of(onUpdate),
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          onSave()
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
}
