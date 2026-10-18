/** Collects de-duplicated diagnostics and maps each line to an editor range. */
import { createLineIndex, lineRange } from './text.ts'
import type { LineIndex, WorkflowDiagnostic, WorkflowDiagnosticSeverity } from './types.ts'

export class DiagnosticCollector {
  readonly items: WorkflowDiagnostic[] = []
  private readonly seen = new Set<string>()
  private readonly index: LineIndex

  constructor(source: string) {
    this.index = createLineIndex(source)
  }

  add(line: number, message: string, severity: WorkflowDiagnosticSeverity = 'error'): void {
    const safeLine = Math.max(1, line)
    const key = `${safeLine}:${severity}:${message}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    const range = lineRange(this.index, safeLine)
    this.items.push({
      from: range.from,
      to: range.to > range.from ? range.to : Math.min(this.index.original.length, range.from + 1),
      line: safeLine,
      severity,
      message,
    })
  }

  get hasErrors(): boolean {
    return this.items.some((item) => item.severity === 'error')
  }
}
