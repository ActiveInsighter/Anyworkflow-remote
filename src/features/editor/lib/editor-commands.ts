import {
  WORKFLOW_DSL_LIMITS,
  collectWorkflowVariables,
  workflowContextAt,
  type WorkflowDslContext,
} from '../../../lib/workflow-dsl/index.ts'
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

/** What the 循环 menu inserts: numbers, a list of items, or chapters with their own sections. */
export type LoopTemplate = 'range' | 'list' | 'outline'

function freeName(base: string, used: Set<string>): string {
  let name = base
  for (let suffix = 2; used.has(name); suffix += 1) name = `${base}${suffix}`
  used.add(name)
  return name
}

/**
 * Lines of a loop template and the part to select. The outline template nests a section loop
 * inside a chapter list; outside an Event it also writes the Task/Event that holds the sections.
 */
function loopTemplateLines(
  template: LoopTemplate,
  context: WorkflowDslContext,
  used: Set<string>,
  rangeName: string,
): { lines: string[]; select: string } {
  if (template === 'range') return { lines: [`@for ${rangeName} in range(1, 3) {`, '  ', '}'], select: rangeName }
  if (template === 'list') {
    return { lines: [`@for ${freeName('item', used)} in [甲, 乙, 丙] {`, '  ', '}'], select: '甲, 乙, 丙' }
  }
  const [ch, title, secs, sec] = ['ch', 'title', 'secs', 'sec'].map((name) => freeName(name, used))
  const indent = (lines: string[]) => lines.map((line) => `  ${line}`)
  const sections = [`@for ${sec} in %${secs}% {`, `  { 写第%${ch}%章《%${title}%》第%index%节：%${sec}% }`, '}']
  const event = [`@event 第%${ch}%章 %${title}% {`, ...indent(sections), '}']
  const task = [`@task 第%${ch}%章 {`, ...indent(event), '}']
  const body = context === 'event' ? sections : context === 'task' ? event : task
  return {
    lines: [
      `@for ${ch}, ${title}, ${secs} in [`,
      '  (1, 第一章, [小节一, 小节二])',
      '  (2, 第二章, [小节一])',
      '] {',
      ...indent(body),
      '}',
    ],
    select: '1, 第一章, [小节一, 小节二]',
  }
}

/**
 * Inserts a loop template on its own lines, indented like the line it lands beside. A cursor in
 * the middle of a line drops the loop on the next line (inside the block when that line opens one),
 * so existing text is never split or replaced. The part worth editing first is selected.
 */
export function planLoopInsert(source: string, at: number, template: LoopTemplate = 'range'): LoopInsertPlan {
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
  const context = workflowContextAt(source, from)
  // Chapters and sections are two loops on one level only inside an Event queue.
  if (template === 'outline' && context === 'event' && scope.depth + 2 > WORKFLOW_DSL_LIMITS.maxLoopNesting) {
    return { ok: false, message: `章节模板需要两层循环，这里已经嵌套了 ${scope.depth} 层。` }
  }
  const separator = !atLineStart && !source.endsWith('\n') && from === source.length ? '\n' : ''
  // At a line start the indentation already in the document leads the first line.
  const firstIndent = atLineStart ? '' : indent
  // Text after the cursor keeps its indentation on the line below the loop.
  const restIndent = atLineStart && source.slice(point, lineEndAfter(source, point)).trim() ? indent : ''
  const shape = loopTemplateLines(template, context, new Set(collectWorkflowVariables(source, point)), scope.name)
  const body = shape.lines.map((text, index) => (index === 0 ? firstIndent : indent) + text).join('\n')
  const text = `${separator}${body}\n${restIndent}`
  return {
    ok: true,
    from,
    text,
    cursorOffset: text.indexOf(shape.select, separator.length),
    selectionLength: shape.select.length,
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

/** The brace a bare cursor touches, or the brace that is all a selection holds besides spaces. */
function selectedStructuralBrace(source: string, from: number, to: number): number | null {
  const start = Math.max(0, Math.min(from, source.length))
  const end = Math.max(start, Math.min(to, source.length))

  if (end > start) {
    const selected = source.slice(start, end)
    const trimmed = selected.trim()
    return trimmed === '{' || trimmed === '}' ? start + selected.indexOf(trimmed) : null
  }

  if (source[start] === '{' || source[start] === '}') return start
  if (start > 0 && (source[start - 1] === '{' || source[start - 1] === '}')) return start - 1
  return null
}

const BLOCK_LABELS: Record<SourceBlockKind, string> = {
  task: 'Task', event: 'Event', act: 'Act', for: '循环', message: '消息块',
}

type SmartRangeKind = 'block' | 'selection' | 'line'

type SmartRangePlan =
  | { ok: true; from: number; to: number; label: string; kind: SmartRangeKind }
  | { ok: false; message: string }

/** Block label with its name, e.g. `Event「第一章」`. */
function blockLabel(source: string, block: SourceBlock): string {
  const label = BLOCK_LABELS[block.kind ?? 'message']
  if (block.kind !== 'task' && block.kind !== 'event') return label
  const name = source.slice(block.headerFrom, block.openAt).trim().replace(/^@(?:task|event)\b/iu, '').trim()
  return name ? `${label}「${[...name].slice(0, 16).join('')}」` : label
}

/** `[from, to)` of a whole block: its header line through `}` and any `*N`, plus the line break. */
function blockRange(source: string, block: SourceBlock): { from: number; to: number } {
  // Include a repeat suffix, but never swallow a sibling sharing this line.
  const suffix = source.slice(block.closeAt + 1).match(/^[ \t]*\*\d+/u)?.[0] ?? ''
  const contentEnd = block.closeAt + 1 + suffix.length
  const lineEnd = lineEndAfter(source, contentEnd)
  return { from: block.headerFrom, to: source.slice(contentEnd, lineEnd).trim() ? contentEnd : lineEnd }
}

/**
 * Resolve once for copy, delete and duplicate: a structural brace (at the cursor, or selected on
 * its own) targets its block; any other selection is taken exactly; a bare cursor takes its line.
 */
function planSmartRange(source: string, from: number, to: number): SmartRangePlan {
  if (!source) return { ok: false, message: '当前没有内容。' }
  const selectionFrom = Math.max(0, Math.min(from, to, source.length))
  const selectionTo = Math.max(selectionFrom, Math.min(Math.max(from, to), source.length))
  const braceAt = selectedStructuralBrace(source, selectionFrom, selectionTo)

  if (braceAt !== null) {
    const block = readSourceStructure(source).blocks.find((item) =>
      item.kind !== null && item.closeAt >= 0 && (item.openAt === braceAt || item.closeAt === braceAt),
    )
    if (block?.kind) return { ok: true, ...blockRange(source, block), label: blockLabel(source, block), kind: 'block' }
  }

  if (selectionTo > selectionFrom) {
    const label = selectionFrom === 0 && selectionTo === source.length ? '全部内容' : '选中内容'
    return { ok: true, from: selectionFrom, to: selectionTo, label, kind: 'selection' }
  }
  const lineTo = lineEndAfter(source, selectionFrom)
  return { ok: true, from: lineStartAt(source, selectionFrom), to: lineTo, label: '当前行', kind: 'line' }
}

export type SelectBlockPlan = { ok: true; from: number; to: number; label: string } | { ok: false; message: string }

/**
 * The smallest whole block (message, Act, loop, Event, Task) larger than the selection. Repeating
 * it widens the selection one block at a time, which is how a phone selects a block.
 */
export function planSelectBlock(source: string, from: number, to: number): SelectBlockPlan {
  const start = Math.max(0, Math.min(from, to, source.length))
  const end = Math.max(start, Math.min(Math.max(from, to), source.length))
  const blocks = readSourceStructure(source).blocks
  let best: { from: number; to: number; block: SourceBlock } | null = null
  for (const block of blocks) {
    if (!block.kind || block.closeAt < 0) continue
    const range = blockRange(source, block)
    const contains = range.from <= start && end <= range.to && (range.from < start || end < range.to)
    if (contains && (!best || range.to - range.from < best.to - best.from)) best = { ...range, block }
  }
  if (!best) return { ok: false, message: start === end ? '光标不在任何块里。' : '选区外面没有更大的块了。' }
  return { ok: true, from: best.from, to: best.to, label: blockLabel(source, best.block) }
}

export type SmartDeletePlan =
  | { ok: true; from: number; to: number; message: string }
  | { ok: false; message: string }

export function planSmartDelete(source: string, from: number, to: number): SmartDeletePlan {
  const plan = planSmartRange(source, from, to)
  if (!plan.ok) return plan
  return {
    ok: true, from: plan.from, to: plan.to,
    message: `已删除${plan.label}`,
  }
}

export type SmartCopyPlan =
  | { ok: true; from: number; to: number; text: string; message: string; kind: SmartRangeKind }
  | { ok: false; message: string }

export function planSmartCopy(source: string, from: number, to: number): SmartCopyPlan {
  const plan = planSmartRange(source, from, to)
  if (!plan.ok) return plan
  const text = source.slice(plan.from, plan.to)
  const lines = text.replace(/\n$/u, '').split('\n').length
  return {
    ok: true, from: plan.from, to: plan.to, text, kind: plan.kind,
    message: `已复制${plan.label}${lines > 1 ? ` · ${lines} 行` : ''}`,
  }
}

export type SmartDuplicatePlan =
  | { ok: true; from: number; text: string; anchor: number; message: string }
  | { ok: false; message: string }

/** Inserts a copy of what the smart range resolves to right after it; blocks and lines keep whole lines. */
export function planSmartDuplicate(source: string, from: number, to: number): SmartDuplicatePlan {
  const plan = planSmartRange(source, from, to)
  if (!plan.ok) return plan
  const body = source.slice(plan.from, plan.to)
  if (plan.kind === 'selection') {
    return { ok: true, from: plan.to, text: body, anchor: plan.to, message: `已复制一份${plan.label}` }
  }
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
