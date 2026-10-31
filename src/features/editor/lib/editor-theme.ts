import { EditorView } from '@codemirror/view'

/**
 * CodeMirror chrome on the `--cm-*` colour roles and the editor type tokens. Syntax colours live
 * in the highlight style (dsl-language.ts); CSS that CodeMirror cannot express (keyframes, the
 * search panel) sits in styles/editor.css.
 *
 * The selection layer is drawn *behind* the lines, so anything painted on a line (the current
 * line, a flash) must be translucent or the selection disappears under it. Rules that compete with
 * CodeMirror's base theme carry `!important`, because the base theme's light/dark scoping is more
 * specific than a plain theme selector.
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
  '.cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'var(--cm-selection-blur) !important' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--cm-selection) !important',
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--cm-selection-match)', borderRadius: '2px' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--cm-bracket-match) !important',
    outline: '1px solid color-mix(in srgb, var(--cm-caret) 45%, transparent)',
    borderRadius: '2px',
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--danger) 22%, transparent) !important',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cm-caret)', borderLeftWidth: '2px' },
  '.cm-flash': { animation: 'aw-cm-flash 900ms ease-out both', borderRadius: '2px' },
  '.cm-flash-line': { animation: 'aw-cm-flash 900ms ease-out both' },
  '.cm-tooltip': {
    border: '1px solid var(--cm-border)',
    backgroundColor: 'var(--cm-tooltip-bg)',
    color: 'var(--cm-fg)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 8px 24px rgb(0 0 0 / 12%)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 8px !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--cm-selection)',
    color: 'var(--cm-fg)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--cm-gutter-bg)',
    color: 'var(--cm-gutter-fg)',
    borderRight: '1px solid color-mix(in srgb, var(--cm-border) 70%, transparent)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8em',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 10px', minWidth: '2.6em' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--cm-fg)', fontWeight: '600' },
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    padding: '0 2px',
    cursor: 'pointer',
    color: 'var(--cm-gutter-fg)',
  },
  '.cm-fold-marker': {
    display: 'inline-flex',
    opacity: '0.55',
    transition: 'opacity var(--duration-fast), transform var(--duration-fast)',
  },
  '.cm-fold-marker[data-open="false"]': { opacity: '1', color: 'var(--cm-caret)', transform: 'rotate(-90deg)' },
  '.cm-gutters:hover .cm-fold-marker, .cm-foldGutter .cm-gutterElement:hover .cm-fold-marker': { opacity: '1' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'color-mix(in srgb, var(--cm-caret) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--cm-caret) 30%, transparent)',
    color: 'var(--cm-caret)',
    borderRadius: '4px',
    padding: '0 6px',
    margin: '0 4px',
  },
  '.cm-panels': { backgroundColor: 'var(--cm-toolbar-bg)', color: 'var(--cm-fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--cm-border)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--warning) 28%, transparent)',
    outline: 'none',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--warning) 52%, transparent)',
  },
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

/** Chevron used by the fold gutter; closed folds rotate it and take the accent colour. */
export function foldMarker(open: boolean): HTMLElement {
  const marker = document.createElement('span')
  marker.className = 'cm-fold-marker'
  marker.dataset.open = String(open)
  marker.setAttribute('aria-hidden', 'true')
  marker.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
  return marker
}
