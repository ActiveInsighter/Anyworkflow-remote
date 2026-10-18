import { EditorView } from '@codemirror/view'

/**
 * CodeMirror chrome on the `--cm-*` colour roles and the editor type tokens. Syntax colours live
 * in the highlight style (anyworkflow-dsl.ts); CSS that CodeMirror cannot express sits in
 * styles/editor.css.
 */
export const editorTheme = EditorView.theme({
  '&': {
    minHeight: '0',
    backgroundColor: 'var(--cm-bg)',
    color: 'var(--cm-fg)',
    fontSize: 'var(--editor-font-size)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    minHeight: '0',
    overflow: 'auto',
    overscrollBehavior: 'auto',
    touchAction: 'pan-y pan-x',
    fontFamily: 'var(--font-mono)',
    lineHeight: 'var(--editor-line-height)',
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
    borderRadius: 'var(--radius-md)',
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
