import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

/**
 * A short tint over text the user just copied or duplicated, so it is obvious what went to the
 * clipboard even when no selection is drawn (a bare cursor copies its line or block). Whole lines
 * are tinted edge to edge; a partial line only under its text.
 */
const setFlash = StateEffect.define<{ from: number; to: number } | null>()

const FLASH_MS = 900
const flashMark = Decoration.mark({ class: 'cm-flash' })
const flashLine = Decoration.line({ class: 'cm-flash-line' })

function flashDecorations(state: EditorState, from: number, to: number): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const end = Math.max(from, to - (to > from && state.doc.sliceString(to - 1, to) === '\n' ? 1 : 0))
  for (let pos = from; pos <= end; ) {
    const line = state.doc.lineAt(pos)
    if (from <= line.from && end >= line.to) ranges.push(flashLine.range(line.from))
    else if (Math.max(from, line.from) < Math.min(end, line.to)) {
      ranges.push(flashMark.range(Math.max(from, line.from), Math.min(end, line.to)))
    }
    if (line.to >= end) break
    pos = line.to + 1
  }
  return Decoration.set(ranges, true)
}

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (effect.is(setFlash)) next = effect.value ? flashDecorations(transaction.state, effect.value.from, effect.value.to) : Decoration.none
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const timers = new WeakMap<EditorView, number>()

/** Tints `from..to` briefly; a newer flash replaces an older one. */
export function flashRange(view: EditorView, from: number, to: number): void {
  if (!view.state.field(flashField, false) || to <= from) return
  view.dispatch({ effects: setFlash.of({ from, to }) })
  const previous = timers.get(view)
  if (previous !== undefined) window.clearTimeout(previous)
  timers.set(
    view,
    window.setTimeout(() => {
      timers.delete(view)
      if (view.dom.isConnected) view.dispatch({ effects: setFlash.of(null) })
    }, FLASH_MS),
  )
}

/** The flash field, plus a flash for the system copy (Ctrl/⌘ C, the phone's copy menu). */
export const editorFlash = [
  flashField,
  EditorView.domEventHandlers({
    copy(_event, view) {
      const { state } = view
      // With nothing selected CodeMirror copies whole lines, as editors usually do.
      const ranges = state.selection.ranges.map((range) =>
        range.empty ? { from: state.doc.lineAt(range.head).from, to: state.doc.lineAt(range.head).to + 1 } : range,
      )
      const from = Math.min(...ranges.map((range) => range.from))
      const to = Math.min(state.doc.length, Math.max(...ranges.map((range) => range.to)))
      queueMicrotask(() => flashRange(view, from, to))
      return false
    },
  }),
]
