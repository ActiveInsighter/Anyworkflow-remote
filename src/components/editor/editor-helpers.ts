import type { Diagnostic } from '@codemirror/lint'

export interface EditorIssue {
  from: number
  to: number
  line: number
  severity: Diagnostic['severity']
  message: string
}

/** Line/column offsets survive formatting because the formatter never adds or removes lines. */
export function offsetForLineColumn(text: string, lineNumber: number, column: number): number {
  const lines = text.split('\n')
  const index = Math.max(0, Math.min(lineNumber - 1, lines.length - 1))
  let offset = 0
  for (let i = 0; i < index; i += 1) offset += lines[i].length + 1
  return offset + Math.max(0, Math.min(column - 1, lines[index].length))
}

export function sameIssues(a: EditorIssue[], b: EditorIssue[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (
      left.from !== right.from ||
      left.to !== right.to ||
      left.line !== right.line ||
      left.severity !== right.severity ||
      left.message !== right.message
    ) {
      return false
    }
  }
  return true
}
