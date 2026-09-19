import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { HighlightStyle, StreamLanguage } from '@codemirror/language'
import type { Diagnostic } from '@codemirror/lint'
import { tags } from '@lezer/highlight'

interface DslState {
  inFence: boolean
  fence: string
}

// Compatibility shim for the editor module; prompt presets are intentionally disabled.
export const PROMPT_TEMPLATES = [] as const

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
      if (line === '}') {
        if (queueDepth > 0) queueDepth -= 1
        else if (stack.at(-1) === 'event') stack.pop()
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
    if (line === '}' && stack.length) stack.pop()
  }

  const top = stack.at(-1)
  if (top === 'event') return 'event'
  if (top === 'task' || top === 'for-event') return 'task'
  return 'run'
}

function collectVariables(source: string): string[] {
  const values = new Set<string>()
  for (const match of source.matchAll(/^\s*@var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gimu)) {
    if (match[1]) values.add(match[1])
  }
  for (const match of source.matchAll(/^\s*@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\(/gimu)) {
    if (match[1]) values.add(match[1])
  }
  return [...values]
}

function directiveOptions(context: DslContext): Completion[] {
  const shared: Completion[] = [
    { label: '@mode', type: 'keyword', detail: 'serial | parallel', apply: '@mode=serial' },
    { label: '@maxConcurrency', type: 'keyword', detail: '1–16', apply: '@maxConcurrency=2' },
    snippetCompletion('@var ${name}=${value}', { label: '@var', type: 'keyword', detail: '变量' }),
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
      snippetCompletion('@event ${执行单元} {\n```\n${提示词}\n```\n}', { label: '@event', type: 'keyword', detail: 'Event 块' }),
      snippetCompletion('@for ${i} in range(1, 3) {\n  @event ${执行单元} {\n```\n${提示词}\n```\n  }\n}', { label: '@for', type: 'keyword', detail: 'Event 循环' }),
    ]
  }

  return [
    snippetCompletion('@act {\n${}\n}', { label: '@act', type: 'keyword', detail: '动作块' }),
    snippetCompletion('@var ${name}=${value}', { label: '@var', type: 'keyword', detail: '变量' }),
    snippetCompletion('```\n${提示词}\n```', { label: '``` prompt', type: 'text', detail: '提示词块' }),
    snippetCompletion('<https://${url}>', { label: '<https://…>', type: 'text', detail: '打开页面' }),
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

  const variable = context.matchBefore(/%[A-Za-z_][A-Za-z0-9_:]*$/u)
  if (variable) {
    const options = collectVariables(source).flatMap((name) => [
      { label: `%${name}%`, type: 'variable', apply: `%${name}%` },
      { label: `%${name}:pad2%`, type: 'variable', apply: `%${name}:pad2%` },
    ])
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

    if (/^@var\b/iu.test(line) && !/^@var\s+[A-Za-z_][A-Za-z0-9_]*\s*=.*$/iu.test(line)) add(lineNumber, '@var 格式应为 @var name=value')

    const forMatch = line.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\((.*?)\)\s*\{\s*$/iu)
    if (/^@for\b/iu.test(line) && !forMatch) add(lineNumber, '@for 格式无效')
    else if (forMatch && !rangeArgsValid(forMatch[2] ?? '')) add(lineNumber, 'range 只支持 1–3 个整数参数，step 不能为 0')

    if (context === 'event') {
      if (/^(?:@act\s*\{|@for\b.*\{|\{)\s*$/iu.test(line)) queueDepth += 1
      else if (line === '}') {
        if (queueDepth > 0) queueDepth -= 1
        else if (stack.at(-1)?.type === 'event') stack.pop()
        else add(lineNumber, '多余的 }')
      } else if (/^@task\s+.+\{\s*$/iu.test(line) || /^@event\s+.+\{\s*$/iu.test(line)) add(lineNumber, 'Event 内不能再定义 Task 或 Event')
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
    if (line === '}') {
      if (!stack.length) add(lineNumber, '多余的 }')
      else stack.pop()
    }
  })

  if (inFence) add(fenceLine || lines.length, '提示词代码块没有闭合')
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
 * Fence delimiters themselves *are* aligned to their block, because both parsers in this
 * repository accept leading whitespace before a fence (`/(?:```|~~~)/` is always tested against a
 * trimmed line, and `parseQueue` matches `/^\s*```/`), so an aligned fence stays parseable.
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
