import { containingBlock, readSourceStructure, type SourceBlock, type SourceStructure } from './source-structure.ts'
import { variableInsertPoint } from './editor-commands.ts'

const START_URL_DECLARATION = /^([ \t]*@(?:let|var)[ \t]+start_url[ \t]*=[ \t]*)(.*?)[ \t]*$/iu

/** `@let start_url=` typed so far on a line, with the cursor (or the line end) after the `=`. */
export const isStartUrlValuePosition = (linePrefix: string) => /^\s*@(?:let|var)\s+start_url\s*=\s*\S*$/iu.test(linePrefix)

export interface TaskStartUrl {
  task: SourceBlock
  /** The declaration, or null when the Task has none. */
  declaration: { lineFrom: number; valueFrom: number; valueTo: number; value: string } | null
}

/** True when `at` sits inside a block nested in `task` (an Event, loop or message). */
function nestedIn(structure: SourceStructure, task: SourceBlock, at: number): boolean {
  return structure.blocks.some(
    (block) => block !== task && block.openAt > task.openAt && block.openAt < at && (block.closeAt < 0 || at <= block.closeAt),
  )
}

/** The Task's own `start_url` declaration; declarations inside nested blocks do not count. */
export function findStartUrlDeclaration(
  source: string,
  structure: SourceStructure,
  task: SourceBlock,
): TaskStartUrl['declaration'] {
  const end = task.closeAt < 0 ? source.length : task.closeAt
  let lineFrom = task.headerEnd
  while (lineFrom < end) {
    const newline = source.indexOf('\n', lineFrom)
    const lineTo = newline < 0 || newline > end ? end : newline
    const match = source.slice(lineFrom, lineTo).match(START_URL_DECLARATION)
    if (match && !nestedIn(structure, task, lineFrom)) {
      const valueFrom = lineFrom + match[1].length
      return { lineFrom, valueFrom, valueTo: valueFrom + match[2].length, value: match[2] }
    }
    if (newline < 0) break
    lineFrom = newline + 1
  }
  return null
}

/** The Task around `at` and its own `start_url` declaration. */
export function taskStartUrlAt(source: string, at: number): TaskStartUrl | null {
  const structure = readSourceStructure(source)
  const task = containingBlock(structure, source.length, at, ['task'])
  return task ? { task, declaration: findStartUrlDeclaration(source, structure, task) } : null
}

export type StartUrlPlan =
  | { ok: true; from: number; to: number; insert: string; cursor: number }
  | { ok: false; message: string }

/**
 * Sets the start page of the Task around `at`: rewrites the value of its declaration, or adds
 * `@let start_url=` after the Task's leading directives.
 */
export function planSetStartUrl(source: string, at: number, url: string): StartUrlPlan {
  const found = taskStartUrlAt(source, at)
  if (!found) return { ok: false, message: '请先把光标放到要设置的 Task 中。' }
  const { task, declaration } = found
  if (declaration) {
    if (declaration.value === url) return { ok: false, message: '这个 Task 已经使用该链接。' }
    return { ok: true, from: declaration.valueFrom, to: declaration.valueTo, insert: url, cursor: declaration.valueFrom + url.length }
  }
  if (task.closeAt < 0) return { ok: false, message: '当前 Task 没有闭合，先补全结构后再设置。' }
  const from = variableInsertPoint(source, task)
  const indent = `${task.indent}  `
  const prefix = from > 0 && source[from - 1] !== '\n' ? '\n' : ''
  const line = `${prefix}${indent}@let start_url=${url}\n`
  return { ok: true, from, to: from, insert: line, cursor: from + line.length - 1 }
}
