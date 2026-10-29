import { redoDepth, undoDepth } from '@codemirror/commands'
import { forEachDiagnostic } from '@codemirror/lint'
import type { EditorState } from '@codemirror/state'
import type { EditorIssue } from './editor-helpers'

export interface EditorStatus {
  canUndo: boolean
  canRedo: boolean
  /** Cursor offset in the document. */
  head: number
  line: number
  column: number
  selected: number
  chars: number
  lines: number
}

export const EMPTY_STATUS: EditorStatus = {
  canUndo: false,
  canRedo: false,
  head: 0,
  line: 1,
  column: 1,
  selected: 0,
  chars: 0,
  lines: 1,
}

export function readStatus(state: EditorState): EditorStatus {
  const selection = state.selection.main
  const line = state.doc.lineAt(selection.head)
  return {
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
    head: selection.head,
    line: line.number,
    column: selection.head - line.from + 1,
    selected: Math.abs(selection.to - selection.from),
    chars: state.doc.length,
    lines: state.doc.lines,
  }
}

export function sameStatus(a: EditorStatus, b: EditorStatus): boolean {
  return (Object.keys(a) as Array<keyof EditorStatus>).every((key) => a[key] === b[key])
}

export function readIssues(state: EditorState): EditorIssue[] {
  const issues: EditorIssue[] = []
  forEachDiagnostic(state, (diagnostic, from, to) => {
    issues.push({ from, to, line: state.doc.lineAt(from).number, severity: diagnostic.severity, message: diagnostic.message })
  })
  return issues
}
