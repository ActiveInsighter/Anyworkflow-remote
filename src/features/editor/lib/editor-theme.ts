import { EditorView } from '@codemirror/view'

/**
 * CodeMirror chrome on the `--cm-*` colour roles and the editor type tokens. Syntax colours live
 * in the highlight style (dsl-language.ts); CSS that CodeMirror cannot express sits in
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
  '.cm-gutters': {
    backgroundColor: 'var(--cm-bg)',
    color: 'var(--cm-gutter-fg)',
    border: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8em',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 10px', minWidth: '2.6em' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--cm-fg)' },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
    cursor: 'pointer',
    color: 'var(--cm-gutter-fg)',
    transition: 'color var(--duration-fast)',
  },
  '.cm-foldGutter .cm-gutterElement:hover': { color: 'var(--cm-fg)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--cm-active-line)',
    border: '1px solid var(--cm-border)',
    color: 'var(--cm-gutter-fg)',
    borderRadius: '4px',
    padding: '0 6px',
    margin: '0 4px',
  },
  '.cm-panels': { backgroundColor: 'var(--cm-toolbar-bg)', color: 'var(--cm-fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--cm-border)' },
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
