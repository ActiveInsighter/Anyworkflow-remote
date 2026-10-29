import { WORKFLOW_DSL_LIMITS, collectWorkflowVariables } from '../../../lib/workflow-dsl/index.ts'
import {
  containingBlock,
  lineEndAfter,
  lineStartAt,
  readSourceStructure,
  type SourceBlock,
  type SourceBlockKind,
} from './source-structure.ts'

export type StructuredInsertKind = 'task' | 'event' | 'act' | 'variable'

/** Default names for nested loops, outermost first; later ones are taken when these are in scope. */
export const LOOP_VARIABLE_NAMES = ['i', 'j', 'k'] as const

export type LoopScope = { ok: true; depth: number; name: string } | { ok: false; message: string }

function firstFreeLoopName(used: ReadonlySet<string>): string {
  for (let suffix = 1; ; suffix += 1) {
    for (const base of LOOP_VARIABLE_NAMES) {
      const name = suffix === 1 ? base : `${base}${suffix}`
      if (!used.has(name)) return name
    }
  }
}

/**
 * Where a new `@for` may go and what to call it. Nesting is counted per level (Run, Task, Event
 * queue), the way the compiler limits it; the name is the first of i, j, k not already in scope
 * anywhere above the cursor, because an upper level would otherwise substitute it first.
 */
export function loopScopeAt(source: string, at: number): LoopScope {
  const point = Math.max(0, Math.min(at, source.length))
  const enclosing = readSourceStructure(source).blocks.filter((block) =>
    block.kind !== null && block.openAt < point && (block.closeAt < 0 || point <= block.closeAt),
  )
  const innermost = enclosing.at(-1)
  if (innermost?.kind === 'message') return { ok: false, message: '消息块里不能放循环，请把光标移到消息块外。' }
  if (innermost?.kind === 'act') return { ok: false, message: 'Act 里不能放循环，请把循环放在 Act 外，或在循环里写消息。' }

  const container = [...enclosing].reverse().find((block) => block.kind === 'task' || block.kind === 'event')
  const depth = enclosing.filter((block) => block.kind === 'for' && block.openAt > (container?.openAt ?? -1)).length
  const max = WORKFLOW_DSL_LIMITS.maxLoopNesting
  if (depth >= max) return { ok: false, message: `循环最多嵌套 ${max} 层。` }
  return { ok: true, depth, name: firstFreeLoopName(new Set(collectWorkflowVariables(source, point))) }
}

export type LoopInsertPlan =
  | { ok: true; from: number; text: string; cursorOffset: number; selectionLength: number }
  | { ok: false; message: string }

/**
 * Inserts an empty loop on its own lines, indented like the line it lands beside. A cursor in the
 * middle of a line drops the loop on the next line (inside the block when that line opens one), so
 * existing text is never split or replaced.
 */
export function planLoopInsert(source: string, at: number): LoopInsertPlan {
  const point = Math.max(0, Math.min(at, source.length))
  const scope = loopScopeAt(source, point)
  if (!scope.ok) return scope

  const lineFrom = lineStartAt(source, point)
  const prefix = source.slice(lineFrom, point)
  const atLineStart = prefix.trim() === ''
  const line = source.slice(lineFrom, lineEndAfter(source, point)).replace(/\r?\n$/u, '')
  const lineIndent = line.match(/^[ \t]*/u)?.[0] ?? ''
  const indent = atLineStart ? prefix : lineIndent + (line.trimEnd().endsWith('{') ? '  ' : '')

  const from = atLineStart ? point : lineEndAfter(source, point)
  const separator = !atLineStart && !source.endsWith('\n') && from === source.length ? '\n' : ''
  // At a line start the indentation already in the document leads the first line.
  const firstIndent = atLineStart ? '' : indent
  // Text after the cursor keeps its indentation on the line below the loop.
  const restIndent = atLineStart && source.slice(point, lineEndAfter(source, point)).trim() ? indent : ''
  const text = `${separator}${firstIndent}@for ${scope.name} in range(1, 3) {\n${indent}  \n${indent}}\n${restIndent}`
  return {
    ok: true,
    from,
    text,
    cursorOffset: separator.length + firstIndent.length + '@for '.length,
    selectionLength: scope.name.length,
  }
}

export type StructuredInsertPlan =
  | { ok: true; from: number; text: string; cursorOffset: number; selectionLength?: number }
  | { ok: false; message: string }

function availableVariableName(source: string, container: SourceBlock, at: number): string {
  const used = new Set(collectWorkflowVariables(source, at))
  const body = source.slice(container.headerEnd, container.closeAt)
  for (const match of body.matchAll(/^\s*@(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gimu)) used.add(match[1])
  let name = 'name'
  for (let suffix = 2; used.has(name); suffix += 1) name = `name${suffix}`
  return name
}

function appendSeparator(before: string): string {
  if (!before) return ''
  if (before.endsWith('\n\n')) return ''
  if (before.endsWith('\n')) return '\n'
  return '\n\n'
}

/** Offset after the leading directives and `@let` lines of a Task or Event body. */
export function variableInsertPoint(source: string, container: SourceBlock): number {
  let cursor = container.headerEnd
  let insertAt = cursor

  while (cursor < container.closeAt) {
    const end = source.indexOf('\n', cursor)
    const lineEnd = end < 0 ? source.length : end
    const line = source.slice(cursor, lineEnd)
    const trimmed = line.trim()
    const next = end < 0 ? source.length : end + 1

    if (!trimmed) {
      cursor = next
      continue
    }

    const directive = /^@(task|mode|maxConcurrency)\s*=/iu.test(trimmed)
    if (directive || /^@(?:let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=/iu.test(trimmed)) {
      insertAt = next
      cursor = next
      continue
    }

    break
  }

  return insertAt
}

export function planStructuredInsert(
  source: string,
  at: number,
  kind: StructuredInsertKind,
): StructuredInsertPlan {
  const structure = readSourceStructure(source)
  if (kind === 'task') {
    if (!structure.closed) {
      return { ok: false, message: `当前工作流还有未闭合的结构，先补全大括号或文本块后再添加 Task。` }
    }
    const separator = appendSeparator(source)
    const directive = '@task'
    const text = `${separator}${directive}  {\n  @mode=serial\n\n}\n`
    return { ok: true, from: source.length, text, cursorOffset: separator.length + directive.length + 1 }
  }

  const targetKinds: SourceBlockKind[] = kind === 'act' ? ['event'] : ['task']
  const container = containingBlock(structure, source.length, at, targetKinds)
  if (!container) {
    const label = kind === 'event' ? 'Event' : kind === 'act' ? 'Act' : '变量'
    const required = kind === 'act' ? 'Event' : 'Task'
    return { ok: false, message: `${label} 只能在 ${required} 内添加，请先把光标放到对应的 ${required} 中。` }
  }
  if (container.closeAt < 0) {
    const label = container.kind === 'event' ? 'Event' : 'Task'
    return { ok: false, message: `当前 ${label} 没有闭合，先补全结构后再插入。` }
  }

  if (kind === 'variable') {
    const from = variableInsertPoint(source, container)
    const indent = container.indent + '  '
    const name = availableVariableName(source, container, at)
    const text = `${indent}@let ${name}=\n`
    return { ok: true, from, text, cursorOffset: indent.length + '@let '.length, selectionLength: name.length }
  }

  const closingLineFrom = lineStartAt(source, container.closeAt)
  const sharedClosingLine = source.slice(closingLineFrom, container.closeAt).trim().length > 0
  const from = sharedClosingLine ? container.closeAt : closingLineFrom
  const closingIndent = sharedClosingLine ? container.indent : ''
  const separator = appendSeparator(source.slice(0, from))
  const indent = container.indent + '  '

  if (kind === 'event') {
    const text =
      `${separator}${indent}@event  {\n` +
      `${indent}  {\n` +
      `${indent}    \n` +
      `${indent}  }\n` +
      `${indent}}\n${closingIndent}`
    return {
      ok: true,
      from,
      text,
      cursorOffset: separator.length + indent.length + '@event '.length,
    }
  }

  const text =
    `${separator}${indent}@act {\n` +
    `${indent}  @event=\n` +
    `${indent}  {\n` +
    `${indent}    \n` +
    `${indent}  }\n` +
    `${indent}}\n${closingIndent}`
  return {
    ok: true,
    from,
    text,
    cursorOffset: separator.length + indent.length + '@act {\n'.length + indent.length + '  @event='.length,
  }
}

function selectedStructuralBrace(source: string, from: number, to: number): number | null {
  const start = Math.max(0, Math.min(from, source.length))
  const end = Math.max(start, Math.min(to, source.length))

  if (end > start) {
    const braces: number[] = []
    for (let index = start; index < end; index += 1) {
      if (source[index] === '{' || source[index] === '}') braces.push(index)
      if (braces.length > 1) return null
    }
    return braces[0] ?? null
  }

  if (source[start] === '{' || source[start] === '}') return start
  if (start > 0 && (source[start - 1] === '{' || source[start - 1] === '}')) return start - 1
  return null
}

const BLOCK_LABELS: Record<SourceBlockKind, string> = {
  task: 'Task', event: 'Event', act: 'Act', for: '循环', message: '消息块',
}

type SmartRangePlan =
  | { ok: true; from: number; to: number; label: string }
  | { ok: false; message: string }

/** Resolve once for both commands: a structural delimiter targets its block, otherwise lines. */
function planSmartRange(source: string, from: number, to: number): SmartRangePlan {
  if (!source) return { ok: false, message: '当前没有内容。' }
  const selectionFrom = Math.max(0, Math.min(from, to, source.length))
  const selectionTo = Math.max(selectionFrom, Math.min(Math.max(from, to), source.length))
  const braceAt = selectedStructuralBrace(source, selectionFrom, selectionTo)

  if (braceAt !== null) {
    const block = readSourceStructure(source).blocks.find((item) =>
      item.kind !== null && item.closeAt >= 0 && (item.openAt === braceAt || item.closeAt === braceAt),
    )
    if (block?.kind) {
      // Include a repeat suffix, but never swallow a sibling sharing this line.
      const suffix = source.slice(block.closeAt + 1).match(/^[ \t]*\*\d+/u)?.[0] ?? ''
      const contentEnd = block.closeAt + 1 + suffix.length
      const lineEnd = lineEndAfter(source, contentEnd)
      const to = source.slice(contentEnd, lineEnd).trim() ? contentEnd : lineEnd
      return { ok: true, from: block.headerFrom, to, label: BLOCK_LABELS[block.kind] }
    }
  }

  const touchedEnd = selectionTo > selectionFrom ? selectionTo - 1 : selectionFrom
  const lineFrom = lineStartAt(source, selectionFrom)
  const lineTo = lineEndAfter(source, touchedEnd)
  const label = lineFrom === lineStartAt(source, touchedEnd) ? '当前行' : '选中行'
  return { ok: true, from: lineFrom, to: lineTo, label }
}

export type SmartDeletePlan =
  | { ok: true; from: number; to: number; message: string }
  | { ok: false; message: string }

export function planSmartDelete(source: string, from: number, to: number): SmartDeletePlan {
  const plan = planSmartRange(source, from, to)
  if (!plan.ok) return plan
  return {
    ok: true, from: plan.from, to: plan.to,
    message: `已删除 ${plan.label}`,
  }
}

export type SmartCopyPlan =
  | { ok: true; from: number; to: number; text: string; message: string }
  | { ok: false; message: string }

export function planSmartCopy(source: string, from: number, to: number): SmartCopyPlan {
  const plan = planSmartRange(source, from, to)
  if (!plan.ok) return plan
  return {
    ok: true, from: plan.from, to: plan.to, text: source.slice(plan.from, plan.to),
    message: `已复制 ${plan.label}`,
  }
}

export type SmartDuplicatePlan =
  | { ok: true; from: number; text: string; anchor: number; message: string }
  | { ok: false; message: string }

/** Inserts a copy of the block (or lines) the smart range resolves to right after it. */
export function planSmartDuplicate(source: string, from: number, to: number): SmartDuplicatePlan {
  const plan = planSmartRange(source, from, to)
  if (!plan.ok) return plan
  const body = source.slice(plan.from, plan.to)
  const leading = plan.to > 0 && source[plan.to - 1] !== '\n' ? '\n' : ''
  const text = `${leading}${body}${body.endsWith('\n') ? '' : '\n'}`
  return { ok: true, from: plan.to, text, anchor: plan.to + leading.length, message: `已复制一份${plan.label}` }
}

export type LineInsertPlan =
  | { ok: true; from: number; text: string; cursorOffset: number; selectionLength: number }
  | { ok: false; message: string }

/**
 * Puts `text` on its own line in an Event queue, indented like its neighbour; a cursor in the
 * middle of a line drops it on the next line. `select` marks the part to select afterwards.
 */
export function planQueueLineInsert(source: string, at: number, text: string, select: string): LineInsertPlan {
  const point = Math.max(0, Math.min(at, source.length))
  const structure = readSourceStructure(source)
  const enclosing = structure.blocks.filter((block) =>
    block.kind !== null && block.openAt < point && (block.closeAt < 0 || point <= block.closeAt),
  )
  const innermost = enclosing.at(-1)
  if (!enclosing.some((block) => block.kind === 'event')) return { ok: false, message: '等待只能放在 Event 中，请把光标移到 Event 里。' }
  if (innermost?.kind === 'message') return { ok: false, message: '消息块里不能放等待，请把光标移到消息块外。' }

  const lineFrom = lineStartAt(source, point)
  const prefix = source.slice(lineFrom, point)
  const atLineStart = prefix.trim() === ''
  const line = source.slice(lineFrom, lineEndAfter(source, point)).replace(/\r?\n$/u, '')
  const lineIndent = line.match(/^[ \t]*/u)?.[0] ?? ''
  const indent = atLineStart ? prefix : lineIndent + (line.trimEnd().endsWith('{') ? '  ' : '')
  const insertAt = atLineStart ? point : lineEndAfter(source, point)
  const separator = !atLineStart && insertAt === source.length && !source.endsWith('\n') ? '\n' : ''
  const firstIndent = atLineStart ? '' : indent
  const restIndent = atLineStart && source.slice(point, lineEndAfter(source, point)).trim() ? indent : ''
  const full = `${separator}${firstIndent}${text}\n${restIndent}`
  const selectAt = Math.max(0, text.indexOf(select))
  return {
    ok: true,
    from: insertAt,
    text: full,
    cursorOffset: separator.length + firstIndent.length + selectAt,
    selectionLength: select.length,
  }
}
