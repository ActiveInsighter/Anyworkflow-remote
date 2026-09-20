import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { HighlightStyle, StreamLanguage } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import type { Diagnostic } from '@codemirror/lint'
import { tags } from '@lezer/highlight'

interface DslState {
  inFence: boolean
  fence: string
}

export const anyWorkflowLanguage = StreamLanguage.define<DslState>({
  startState: () => ({ inFence: false, fence: '' }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol()) {
      const rest = stream.string.slice(stream.pos)
      const fence = rest.match(/^\s*(```|~~~)/u)?.[1]
      if (fence) {
        if (!state.inFence) {
          state.inFence = true
          state.fence = fence
        } else if (state.fence === fence) {
          state.inFence = false
          state.fence = ''
        }
        stream.skipToEnd()
        return 'string'
      }
    }

    if (state.inFence) {
      stream.skipToEnd()
      return 'string'
    }

    if (stream.match(/@[A-Za-z][A-Za-z0-9]*/)) return 'keyword'
    if (stream.match(/%[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)?%/)) return 'variableName'
    if (stream.match(/<https?:\/\/[^>]+>/)) return 'link'
    if (stream.match(/\b(?:serial|parallel)\b/)) return 'atom'
    if (stream.match(/\brange(?=\()/)) return 'function'
    if (stream.match(/\*\d+/)) return 'number'
    if (stream.match(/\b\d+\b/)) return 'number'
    if (stream.match(/[{}()[\],=]/)) return 'bracket'
    if (stream.match(/#.*/)) return 'comment'
    stream.next()
    return null
  },
})

export const anyWorkflowHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--cm-keyword)', fontWeight: '600' },
  { tag: tags.variableName, color: 'var(--cm-variable)' },
  { tag: tags.string, color: 'var(--cm-string)' },
  { tag: tags.link, color: 'var(--cm-link)', textDecoration: 'underline' },
  { tag: tags.atom, color: 'var(--cm-atom)' },
  { tag: tags.number, color: 'var(--cm-number)' },
  { tag: tags.function(tags.variableName), color: 'var(--cm-function)' },
  { tag: tags.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: tags.bracket, color: 'var(--cm-bracket)' },
])

type DslContext = 'run' | 'task' | 'event'

interface ClosingLine {
  braceCount: number
  repeatCount: number | null
}

function parseClosingLine(line: string): ClosingLine | null {
  const match = line.match(/^(\}+)(?:\*(\d+))?$/u)
  if (!match?.[1]) return null
  return {
    braceCount: match[1].length,
    repeatCount: match[2] === undefined ? null : Number(match[2]),
  }
}

function dslContextAt(source: string, at: number): DslContext {
  const lines = source.slice(0, at).split(/\r?\n/u)
  const stack: Array<'task' | 'event' | 'for-task' | 'for-event'> = []
  let inFence = false
  let queueDepth = 0

  for (const raw of lines) {
    const line = raw.trim()
    if (/^(?:```|~~~)/u.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || !line) continue

    const top = stack.at(-1)
    const context: DslContext = top === 'event' ? 'event' : top === 'task' || top === 'for-event' ? 'task' : 'run'

    if (context === 'event') {
      if (/^(?:@act\s*\{|@for\b.*\{|\{)\s*$/iu.test(line)) {
        queueDepth += 1
        continue
      }
      const closing = parseClosingLine(line)
      if (closing) {
        let remaining = closing.braceCount
        while (remaining > 0) {
          if (queueDepth > 0) queueDepth -= 1
          else if (stack.at(-1) === 'event') stack.pop()
          else break
          remaining -= 1
        }
      }
      continue
    }

    if (/^@task\s+.+\{\s*$/iu.test(line)) {
      stack.push('task')
      continue
    }
    if (/^@event\s+.+\{\s*$/iu.test(line)) {
      stack.push('event')
      continue
    }
    if (/^@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\([^)]*\)\s*\{\s*$/iu.test(line)) {
      stack.push(context === 'run' ? 'for-task' : 'for-event')
      continue
    }
    const closing = parseClosingLine(line)
    if (closing?.repeatCount === null) {
      for (let index = 0; index < closing.braceCount && stack.length; index += 1) stack.pop()
    }
  }

  const top = stack.at(-1)
  if (top === 'event') return 'event'
  if (top === 'task' || top === 'for-event') return 'task'
  return 'run'
}

export type StructuredInsertKind = 'task' | 'event' | 'act' | 'variable'

export type StructuredInsertPlan =
  | { ok: true; from: number; text: string; cursorOffset: number }
  | { ok: false; message: string }

interface StructuralBlock {
  kind: 'task' | 'event'
  headerFrom: number
  headerEnd: number
  openAt: number
  closeAt: number
  indent: string
}

function matchingBraceAt(source: string, openAt: number): number {
  let depth = 0
  let inFence = false
  let fence = ''

  for (let index = openAt; index < source.length; index += 1) {
    const atLineStart = index === 0 || source[index - 1] === '\n'
    if (atLineStart) {
      let contentAt = index
      while (source[contentAt] === ' ' || source[contentAt] === '\t') contentAt += 1
      const marker = source.slice(contentAt, contentAt + 3)
      if (marker === '```' || marker === '~~~') {
        const end = source.indexOf('\n', contentAt)
        if (!inFence) {
          inFence = true
          fence = marker
        } else if (fence === marker) {
          inFence = false
          fence = ''
        }
        if (end < 0) return -1
        index = end
        continue
      }
    }

    if (inFence) continue
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function sourceStructureIsClosed(source: string): boolean {
  let depth = 0
  let inFence = false
  let fence = ''

  for (let index = 0; index < source.length; index += 1) {
    const atLineStart = index === 0 || source[index - 1] === '\n'
    if (atLineStart) {
      let contentAt = index
      while (source[contentAt] === ' ' || source[contentAt] === '\t') contentAt += 1
      const marker = source.slice(contentAt, contentAt + 3)
      if (marker === '```' || marker === '~~~') {
        if (!inFence) {
          inFence = true
          fence = marker
        } else if (fence === marker) {
          inFence = false
          fence = ''
        }
        const end = source.indexOf('\n', contentAt)
        if (end < 0) return !inFence && depth === 0
        index = end
        continue
      }
    }

    if (inFence) continue
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth < 0) return false
    }
  }

  return !inFence && depth === 0
}

function structuralBlocks(source: string): StructuralBlock[] {
  const blocks: StructuralBlock[] = []
  let offset = 0
  let inFence = false
  let fence = ''

  while (offset <= source.length) {
    const newline = source.indexOf('\n', offset)
    const lineEnd = newline < 0 ? source.length : newline
    const raw = source.slice(offset, lineEnd)
    const trimmed = raw.trim()
    const fenceMatch = trimmed.match(/^(?:```|~~~)/u)?.[0]

    if (fenceMatch) {
      if (!inFence) {
        inFence = true
        fence = fenceMatch
      } else if (fence === fenceMatch) {
        inFence = false
        fence = ''
      }
    } else if (!inFence) {
      const header = raw.match(/^([ \t]*)@(task|event)(?:\s+.*?)?\s*\{\s*$/iu)
      if (header?.[2]) {
        const openInLine = raw.lastIndexOf('{')
        const openAt = offset + openInLine
        blocks.push({
          kind: header[2].toLowerCase() as 'task' | 'event',
          headerFrom: offset,
          headerEnd: newline < 0 ? source.length : newline + 1,
          openAt,
          closeAt: matchingBraceAt(source, openAt),
          indent: header[1] ?? '',
        })
      }
    }

    if (newline < 0) break
    offset = newline + 1
  }

  return blocks
}

function containingBlock(source: string, at: number, kind: StructuralBlock['kind']): StructuralBlock | null {
  const point = Math.max(0, Math.min(at, source.length))
  return (
    structuralBlocks(source)
      .filter((block) =>
        block.kind === kind &&
        block.headerFrom <= point &&
        (block.closeAt < 0 || point <= block.closeAt),
      )
      .sort((a, b) => b.headerFrom - a.headerFrom)[0] ?? null
  )
}

function lineStartAt(source: string, at: number): number {
  const newline = source.lastIndexOf('\n', Math.max(0, at - 1))
  return newline < 0 ? 0 : newline + 1
}

function appendSeparator(before: string): string {
  if (!before) return ''
  if (before.endsWith('\n\n')) return ''
  if (before.endsWith('\n')) return '\n'
  return '\n\n'
}

function variableInsertPoint(source: string, task: StructuralBlock): number {
  let cursor = task.headerEnd
  let insertAt = cursor

  while (cursor < task.closeAt) {
    const end = source.indexOf('\n', cursor)
    const lineEnd = end < 0 ? source.length : end
    const line = source.slice(cursor, lineEnd)
    const trimmed = line.trim()
    const next = end < 0 ? source.length : end + 1

    if (!trimmed) {
      cursor = next
      continue
    }

    if (/^@(mode|maxConcurrency)\s*=/iu.test(trimmed) || /^@var\s+[A-Za-z_][A-Za-z0-9_]*\s*=/iu.test(trimmed)) {
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
  if (kind === 'task') {
    if (!sourceStructureIsClosed(source)) {
      return { ok: false, message: '当前工作流还有未闭合的结构，先补全大括号或文本块后再添加 Task。' }
    }
    const separator = appendSeparator(source)
    const text = `${separator}@task  {\n  @mode=serial\n\n}\n`
    return { ok: true, from: source.length, text, cursorOffset: separator.length + '@task '.length }
  }

  const targetKind = kind === 'event' || kind === 'variable' ? 'task' : 'event'
  const container = containingBlock(source, at, targetKind)
  if (!container) {
    const label = kind === 'event' ? 'Event' : kind === 'act' ? 'Act' : '变量'
    const required = kind === 'event' || kind === 'variable' ? 'Task' : 'Event'
    return { ok: false, message: `${label} 只能在 ${required} 内添加，请先把光标放到对应的 ${required} 中。` }
  }
  if (container.closeAt < 0) {
    const label = container.kind === 'task' ? 'Task' : 'Event'
    return { ok: false, message: `当前 ${label} 没有闭合，先补全结构后再插入。` }
  }

  if (kind === 'variable') {
    const from = variableInsertPoint(source, container)
    const indent = container.indent + '  '
    const text = `${indent}@var =\n`
    return { ok: true, from, text, cursorOffset: indent.length + '@var '.length }
  }

  const from = lineStartAt(source, container.closeAt)
  const separator = appendSeparator(source.slice(0, from))
  const indent = container.indent + '  '

  if (kind === 'event') {
    const text =
      `${separator}${indent}@event  {\n` +
      `${indent}  {\n` +
      `${indent}    \n` +
      `${indent}  }\n` +
      `${indent}}\n`
    return {
      ok: true,
      from,
      text,
      cursorOffset: separator.length + indent.length + '@event '.length,
    }
  }

  const text =
    `${separator}${indent}@act {\n` +
    `${indent}  @action=\n` +
    `${indent}  {\n` +
    `${indent}    \n` +
    `${indent}  }\n` +
    `${indent}}\n`
  return {
    ok: true,
    from,
    text,
    cursorOffset: separator.length + indent.length + '@act {\n'.length + indent.length + '  @action='.length,
  }
}

export type SmartDeletePlan =
  | { ok: true; from: number; to: number; message: string }
  | { ok: false; message: string }

interface BracePair {
  openAt: number
  closeAt: number
}

function bracePairs(source: string): BracePair[] {
  const stack: number[] = []
  const pairs: BracePair[] = []
  let inFence = false
  let fence = ''

  for (let index = 0; index < source.length; index += 1) {
    const atLineStart = index === 0 || source[index - 1] === '\n'
    if (atLineStart) {
      let contentAt = index
      while (source[contentAt] === ' ' || source[contentAt] === '\t') contentAt += 1
      const marker = source.slice(contentAt, contentAt + 3)
      if (marker === '```' || marker === '~~~') {
        if (!inFence) {
          inFence = true
          fence = marker
        } else if (fence === marker) {
          inFence = false
          fence = ''
        }
        const end = source.indexOf('\n', contentAt)
        if (end < 0) break
        index = end
        continue
      }
    }

    if (inFence) continue
    if (source[index] === '{') stack.push(index)
    else if (source[index] === '}') {
      const openAt = stack.pop()
      if (openAt !== undefined) pairs.push({ openAt, closeAt: index })
    }
  }

  return pairs
}

function lineEndAfter(source: string, at: number): number {
  const newline = source.indexOf('\n', Math.max(0, at))
  return newline < 0 ? source.length : newline + 1
}

function structuralBraceLabel(source: string, openAt: number): string | null {
  const start = lineStartAt(source, openAt)
  const prefix = source.slice(start, openAt + 1).trim()

  if (/^@task\b.*\{$/iu.test(prefix)) return 'Task'
  if (/^@event\b.*\{$/iu.test(prefix)) return 'Event'
  if (/^@act\s*\{$/iu.test(prefix)) return 'Act'
  if (/^@for\b.*\{$/iu.test(prefix)) return '循环'
  if (prefix === '{') return '消息块'
  return null
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

export function planSmartDelete(source: string, from: number, to: number): SmartDeletePlan {
  if (!source) return { ok: false, message: '当前没有可删除的内容。' }

  const selectionFrom = Math.max(0, Math.min(from, to, source.length))
  const selectionTo = Math.max(selectionFrom, Math.min(Math.max(from, to), source.length))
  const braceAt = selectedStructuralBrace(source, selectionFrom, selectionTo)

  if (braceAt !== null) {
    const pair = bracePairs(source).find((item) => item.openAt === braceAt || item.closeAt === braceAt)
    if (pair) {
      const label = structuralBraceLabel(source, pair.openAt)
      if (label) {
        const blockFrom = lineStartAt(source, pair.openAt)
        const blockTo = lineEndAfter(source, pair.closeAt)
        return { ok: true, from: blockFrom, to: blockTo, message: `已删除 ${label}` }
      }
    }
  }

  const touchedEnd = selectionTo > selectionFrom ? selectionTo - 1 : selectionFrom
  const lineFrom = lineStartAt(source, selectionFrom)
  const lineTo = lineEndAfter(source, touchedEnd)
  const message = lineFrom === lineStartAt(source, touchedEnd) ? '已删除当前行' : '已删除选中行'
  return { ok: true, from: lineFrom, to: lineTo, message }
}

interface VariableScope {
  kind: 'run' | 'task' | 'event' | 'act' | 'message' | 'for-task' | 'for-event' | 'for-queue'
  variables: Set<string>
}

function variableScopeContext(frames: VariableScope[]): DslContext {
  const kind = frames.at(-1)?.kind ?? 'run'
  if (kind === 'event' || kind === 'act' || kind === 'message' || kind === 'for-queue') return 'event'
  if (kind === 'task' || kind === 'for-event') return 'task'
  return 'run'
}

export function collectUsableVariables(source: string, at: number): string[] {
  const frames: VariableScope[] = [{ kind: 'run', variables: new Set<string>() }]
  const prefix = source.slice(0, Math.max(0, Math.min(at, source.length)))
  const lines = prefix.split(/\r?\n/u)
  let inFence = false

  for (const raw of lines) {
    const line = raw.trim()
    if (/^(?:```|~~~)/u.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || !line || line.startsWith('#') || line.startsWith('//')) continue

    const closing = parseClosingLine(line)
    if (closing) {
      for (let index = 0; index < closing.braceCount && frames.length > 1; index += 1) frames.pop()
      continue
    }

    const context = variableScopeContext(frames)
    const variable = line.match(/^@var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/iu)
    if (variable?.[1]) {
      // User-defined variables are Task-scoped. Event/Run declarations are invalid and should
      // never leak into completion suggestions even when editing an older malformed draft.
      if (context === 'task') frames.at(-1)?.variables.add(variable[1])
      continue
    }

    const loop = line.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\([^)]*\)\s*\{\s*$/iu)
    if (loop?.[1]) {
      frames.push({
        kind: context === 'run' ? 'for-task' : context === 'task' ? 'for-event' : 'for-queue',
        variables: new Set([loop[1]]),
      })
      continue
    }

    if (/^@task\s+.+\{\s*$/iu.test(line)) {
      frames.push({ kind: 'task', variables: new Set<string>() })
      continue
    }
    if (/^@event\s+.+\{\s*$/iu.test(line)) {
      frames.push({ kind: 'event', variables: new Set<string>() })
      continue
    }
    if (/^@act\s*\{\s*$/iu.test(line)) {
      frames.push({ kind: 'act', variables: new Set<string>() })
      continue
    }
    if (/^\{\s*$/u.test(line)) frames.push({ kind: 'message', variables: new Set<string>() })
  }

  const visible = new Set<string>()
  for (const frame of frames) {
    for (const name of frame.variables) visible.add(name)
  }
  return [...visible]
}

function applyVariableCompletion(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
): void {
  const replaceTo = view.state.doc.sliceString(to, to + 1) === '%' ? to + 1 : to
  view.dispatch({
    changes: { from, to: replaceTo, insert: completion.label },
    selection: { anchor: from + completion.label.length },
    scrollIntoView: true,
  })
}

function variableOptions(source: string, at: number): Completion[] {
  return collectUsableVariables(source, at).map((name) => ({
    label: `%${name}%`,
    type: 'variable',
    detail: '变量',
    apply: applyVariableCompletion,
  }))
}

function directiveOptions(context: DslContext): Completion[] {
  const shared: Completion[] = [
    { label: '@mode', type: 'keyword', detail: 'serial | parallel', apply: '@mode=serial' },
    { label: '@maxConcurrency', type: 'keyword', detail: '1–16', apply: '@maxConcurrency=2' },
  ]

  if (context === 'run') {
    return [
      ...shared,
      snippetCompletion('@task ${任务名称} {\n  @mode=serial\n\n  ${}\n}', { label: '@task', type: 'keyword', detail: 'Task 块' }),
      snippetCompletion('@for ${i} in range(1, 3) {\n  @task ${任务名称} {\n    ${}\n  }\n}', { label: '@for', type: 'keyword', detail: 'Task 循环' }),
    ]
  }

  if (context === 'task') {
    return [
      ...shared,
      snippetCompletion('@var ${name}=${value}', { label: '@var', type: 'keyword', detail: 'Task 变量' }),
      snippetCompletion('@event ${执行单元} {\n  {\n    ${消息}\n  }\n}', { label: '@event', type: 'keyword', detail: 'Event 块' }),
      snippetCompletion('@for ${i} in range(1, 3) {\n  @event ${执行单元} {\n    {\n      ${消息}\n    }\n  }\n}', { label: '@for', type: 'keyword', detail: 'Event 循环' }),
    ]
  }

  return [
    snippetCompletion('@act {\n  @action=${动作名称}\n  {\n    ${消息}\n  }\n}', { label: '@act', type: 'keyword', detail: 'Act 块' }),
    snippetCompletion('{\n  ${消息}\n}', { label: '{ message }', type: 'text', detail: '消息块' }),
    snippetCompletion('<${链接}>', { label: '<链接>', type: 'text', detail: '打开页面' }),
  ]
}

export function anyWorkflowCompletion(context: CompletionContext): CompletionResult | null {
  const source = context.state.doc.toString()
  const line = context.state.doc.lineAt(context.pos)
  const prefix = line.text.slice(0, context.pos - line.from)

  if (/^\s*@mode\s*=\s*[A-Za-z]*$/iu.test(prefix)) {
    const word = context.matchBefore(/[A-Za-z]*$/u)
    return {
      from: word?.from ?? context.pos,
      options: [
        { label: 'serial', type: 'enum', detail: '串行' },
        { label: 'parallel', type: 'enum', detail: '并行' },
      ],
    }
  }

  const variable =
    context.matchBefore(/%[A-Za-z_][A-Za-z0-9_:]*$/u) ??
    (context.explicit ? context.matchBefore(/%$/u) : null)
  if (variable) {
    const options = variableOptions(source, context.pos)
    return options.length ? { from: variable.from, options } : null
  }

  const directive = context.matchBefore(/@[A-Za-z]*$/u)
  if (directive) {
    return { from: directive.from, options: directiveOptions(dslContextAt(source, context.pos)), validFor: /^@[A-Za-z]*$/u }
  }

  if (context.explicit) return { from: context.pos, options: directiveOptions(dslContextAt(source, context.pos)) }
  return null
}

function rangeArgsValid(value: string): boolean {
  const parts = value.split(',').map((part) => part.trim())
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => part === '')) return false
  const numbers = parts.map(Number)
  if (numbers.some((value) => !Number.isSafeInteger(value))) return false
  return !(numbers.length === 3 && numbers[2] === 0)
}

export function validateAnyWorkflowSource(source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = source.split(/\r?\n/u)
  const stack: Array<{ type: 'task' | 'event' | 'for-task' | 'for-event'; line: number }> = []
  let inFence = false
  let fenceLine = 0
  let queueDepth = 0

  const lineStartAt = (lineNumber: number) => lines.slice(0, lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0)
  const add = (lineNumber: number, message: string, severity: Diagnostic['severity'] = 'error') => {
    const lineStart = lineStartAt(lineNumber)
    const length = lines[lineNumber - 1]?.length ?? 0
    diagnostics.push({ from: lineStart, to: Math.max(lineStart + 1, lineStart + length), severity, message })
  }

  lines.forEach((raw, index) => {
    const lineNumber = index + 1
    const line = raw.trim()

    if (/^(?:```|~~~)/u.test(line)) {
      if (!inFence) {
        inFence = true
        fenceLine = lineNumber
      } else {
        inFence = false
        fenceLine = 0
      }
      return
    }
    if (inFence || !line) return

    const top = stack.at(-1)
    const context: DslContext = top?.type === 'event' ? 'event' : top?.type === 'task' || top?.type === 'for-event' ? 'task' : 'run'

    const mode = line.match(/^@mode\s*=\s*(\S+)\s*$/iu)
    if (mode && mode[1] !== 'serial' && mode[1] !== 'parallel') add(lineNumber, '@mode 只能是 serial 或 parallel')

    const concurrency = line.match(/^@maxConcurrency\s*=\s*(\S+)\s*$/iu)
    if (concurrency) {
      const value = Number(concurrency[1])
      if (!Number.isSafeInteger(value) || value < 1 || value > 16) add(lineNumber, '@maxConcurrency 必须是 1–16')
    }

    if (/^@var\b/iu.test(line) && !(context === 'event' && queueDepth > 0)) {
      if (!/^@var\s+[A-Za-z_][A-Za-z0-9_]*\s*=.*$/iu.test(line)) add(lineNumber, '@var 格式应为 @var name=value')
      else if (context !== 'task') add(lineNumber, '@var 只能定义在 Task 内；Event 中直接使用 %变量名%')
    }

    const forMatch = line.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\((.*?)\)\s*\{\s*$/iu)
    if (/^@for\b/iu.test(line) && !forMatch) add(lineNumber, '@for 格式无效')
    else if (forMatch && !rangeArgsValid(forMatch[2] ?? '')) add(lineNumber, 'range 只支持 1–3 个整数参数，step 不能为 0')

    if (context === 'event') {
      if (/^(?:@act\s*\{|@for\b.*\{|\{)\s*$/iu.test(line)) queueDepth += 1
      else {
        const closing = parseClosingLine(line)
        if (closing) {
          if (closing.repeatCount !== null && queueDepth === 0) {
            add(lineNumber, '*N 重复后缀只能用于 Event 内部的消息或队列块')
          } else if (closing.repeatCount !== null && closing.repeatCount < 1) {
            add(lineNumber, '*N 的重复次数必须大于等于 1')
          }

          let remaining = closing.braceCount
          while (remaining > 0) {
            if (queueDepth > 0) queueDepth -= 1
            else if (stack.at(-1)?.type === 'event') stack.pop()
            else add(lineNumber, '多余的 }')
            remaining -= 1
          }
        } else if (/^@task\s+.+\{\s*$/iu.test(line) || /^@event\s+.+\{\s*$/iu.test(line)) {
          add(lineNumber, 'Event 内不能再定义 Task 或 Event')
        }
      }
      return
    }

    if (/^@task\s+.+\{\s*$/iu.test(line)) {
      if (context !== 'run') add(lineNumber, 'Task 只能直接位于 Run 或 Run 的 @for 中')
      stack.push({ type: 'task', line: lineNumber })
      return
    }
    if (/^@event\s+.+\{\s*$/iu.test(line)) {
      if (context !== 'task') add(lineNumber, 'Event 只能直接位于 Task 或 Task 的 @for 中')
      stack.push({ type: 'event', line: lineNumber })
      return
    }
    if (forMatch) {
      stack.push({ type: context === 'run' ? 'for-task' : 'for-event', line: lineNumber })
      return
    }
    const closing = parseClosingLine(line)
    if (closing) {
      if (closing.repeatCount !== null) add(lineNumber, '*N 重复后缀只能用于 Event 内部的消息或队列块')
      for (let closeIndex = 0; closeIndex < closing.braceCount; closeIndex += 1) {
        if (!stack.length) add(lineNumber, '多余的 }')
        else stack.pop()
      }
    }
  })

  if (inFence) add(fenceLine || lines.length, '兼容文本块没有闭合')
  if (queueDepth > 0) add(lines.length, 'Event 内部块没有闭合')
  for (const block of stack) {
    const label = block.type === 'task' ? 'Task' : block.type === 'event' ? 'Event' : '@for'
    add(block.line, `${label} 块没有闭合`)
  }
  if (!/^\s*@run\s*=/imu.test(source)) diagnostics.push({ from: 0, to: Math.min(1, source.length), severity: 'warning', message: '缺少 @run 标题' })
  return diagnostics
}

const INDENT = '  '

/**
 * Re-indents a plan from its block structure. Structural and directive lines get two spaces per
 * nesting level; everything inside a ``` / ~~~ fence is copied through byte for byte.
 *
 * Prompt bodies are deliberately never re-indented. They are the text the executor actually
 * receives, and indentation is not neutral inside them: four leading spaces turn a Markdown list
 * into a code block, and two trailing spaces are a hard line break. Rewriting that text would
 * silently change what runs.
 *
 * Fence delimiters themselves *are* aligned to their block because the DSL validator treats
 * fence markers after trimming line indentation, so an aligned legacy fence stays parseable.
 *
 * The result is idempotent: formatting already-formatted source returns it unchanged, so callers
 * can use a string comparison to decide whether a transaction is worth dispatching.
 */
export function formatAnyWorkflowSource(source: string): string {
  const lines = source.split(/\r?\n/u)
  const out: string[] = []
  let depth = 0
  let inFence = false

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (/^(?:```|~~~)/u.test(trimmed)) {
      out.push(INDENT.repeat(depth) + trimmed)
      inFence = !inFence
      continue
    }

    if (inFence) {
      out.push(raw)
      continue
    }

    if (!trimmed) {
      out.push('')
      continue
    }

    const leadingCloses = trimmed.match(/^\}+/u)?.[0].length ?? 0
    const opens = trimmed.match(/\{/gu)?.length ?? 0
    const closes = trimmed.match(/\}/gu)?.length ?? 0

    out.push(INDENT.repeat(Math.max(0, depth - leadingCloses)) + trimmed)
    depth = Math.max(0, depth + opens - closes)
  }

  return out.join('\n')
}
