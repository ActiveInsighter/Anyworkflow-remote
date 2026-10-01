import { collectWorkflowVariables } from '../../lib/workflow-dsl.ts'
import {
  containingBlock,
  lineEndAfter,
  lineStartAt,
  readSourceStructure,
  type SourceBlock,
  type SourceBlockKind,
} from './source-structure.ts'

export type StructuredInsertKind = 'task' | 'codex' | 'event' | 'act' | 'variable'

export type StructuredInsertPlan =
  | { ok: true; from: number; text: string; cursorOffset: number; selectionLength?: number }
  | { ok: false; message: string }

function availableVariableName(source: string, container: SourceBlock, at: number): string {
  const used = new Set(collectWorkflowVariables(source, at))
  const body = source.slice(container.headerEnd, container.closeAt)
  for (const match of body.matchAll(/^\s*@var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gimu)) used.add(match[1])
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

function variableInsertPoint(source: string, container: SourceBlock): number {
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
    if (directive || /^@var\s+[A-Za-z_][A-Za-z0-9_]*\s*=/iu.test(trimmed)) {
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
  if (kind === 'task' || kind === 'codex') {
    if (!structure.closed) {
      return { ok: false, message: `当前工作流还有未闭合的结构，先补全大括号或文本块后再添加 ${kind === 'codex' ? 'Codex' : 'Task'}。` }
    }
    const separator = appendSeparator(source)
    const directive = kind === 'codex' ? '@Codex' : '@task'
    const text = `${separator}${directive}  {\n  @mode=serial\n\n}\n`
    return { ok: true, from: source.length, text, cursorOffset: separator.length + directive.length + 1 }
  }

  const targetKinds: SourceBlockKind[] = kind === 'act' ? ['event'] : ['task', 'codex']
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
    const text = `${indent}@var ${name}=\n`
    return { ok: true, from, text, cursorOffset: indent.length + '@var '.length, selectionLength: name.length }
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
  task: 'Task', codex: 'Codex', event: 'Event', act: 'Act', for: '循环', message: '消息块',
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
