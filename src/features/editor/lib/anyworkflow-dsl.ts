import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { HighlightStyle, StreamLanguage } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import {
  collectWorkflowVariableScope,
  collectWorkflowVariables,
  validateWorkflowSource,
  workflowContextAt,
  type WorkflowDslContext,
  type WorkflowVariable,
} from '../../../lib/workflow-dsl/index.ts'
import { START_LINKS } from '../../../lib/domain/start-links.ts'

/** `@let start_url=` line, with the cursor (or the end of the line) after the `=`. */
const START_URL_LINE = /^(\s*@(?:let|var)\s+start_url\s*=\s*)(\S*)$/iu
export const isStartUrlValuePosition = (linePrefix: string) => START_URL_LINE.test(linePrefix)

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
    // start_url is the one variable the compiler gives a meaning to, so it is drawn differently.
    if (stream.match(/\bstart_url\b(?=\s*=)/)) return 'special'
    if (stream.match(/%[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)?%/)) return 'variableName'
    if (stream.match(/<(?:https?:\/\/[^>]+|self|current|here|本页|当前页|当前页面)>/iu)) return 'link'
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
  { tag: tags.special(tags.variableName), color: 'var(--cm-link)', fontWeight: '700' },
  { tag: tags.string, color: 'var(--cm-string)' },
  { tag: tags.link, color: 'var(--cm-link)', textDecoration: 'underline' },
  { tag: tags.atom, color: 'var(--cm-atom)' },
  { tag: tags.number, color: 'var(--cm-number)' },
  { tag: tags.function(tags.variableName), color: 'var(--cm-function)' },
  { tag: tags.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: tags.bracket, color: 'var(--cm-bracket)' },
])

type DslContext = WorkflowDslContext

export { planStructuredInsert, planSmartCopy, planSmartDelete } from './editor-commands.ts'
export type { StructuredInsertKind, StructuredInsertPlan, SmartCopyPlan, SmartDeletePlan } from './editor-commands.ts'

export const collectUsableVariables = collectWorkflowVariables

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

/** What the completion list says about a variable; aliases explain themselves and sort last. */
function variableCompletionInfo(variable: WorkflowVariable): Pick<Completion, 'detail' | 'boost'> {
  if (variable.origin === 'loop') return { detail: '循环变量' }
  if (variable.origin === 'declared') return { detail: '变量' }
  return variable.name === 'index'
    ? { detail: `循环值，同 %${variable.loop}%`, boost: -50 }
    : { detail: '循环次数', boost: -50 }
}

function variableOptions(source: string, at: number): Completion[] {
  return collectWorkflowVariableScope(source, at).map((variable) => ({
    label: `%${variable.name}%`,
    type: 'variable',
    ...variableCompletionInfo(variable),
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
      snippetCompletion('@let ${name}=${value}', { label: '@let', type: 'keyword', detail: 'Task 变量' }),
      snippetCompletion('@let start_url=${}', { label: '@let start_url', type: 'keyword', detail: '起始链接' }),
      snippetCompletion('@event ${执行单元} {\n  {\n    ${消息}\n  }\n}', { label: '@event', type: 'keyword', detail: 'Event 块' }),
      snippetCompletion('@for ${i} in range(1, 3) {\n  @event ${执行单元} {\n    {\n      ${消息}\n    }\n  }\n}', { label: '@for', type: 'keyword', detail: 'Event 循环' }),
    ]
  }

  return [
    snippetCompletion('@act {\n  @event=${事件名称}\n  {\n    ${消息}\n  }\n}', { label: '@act', type: 'keyword', detail: 'Act 块' }),
    snippetCompletion('{\n  ${消息}\n}', { label: '{ message }', type: 'text', detail: '消息块' }),
    snippetCompletion('<${链接}>', { label: '<链接>', type: 'text', detail: '打开页面' }),
  ]
}

export function anyWorkflowCompletion(context: CompletionContext): CompletionResult | null {
  const source = context.state.doc.toString()
  const line = context.state.doc.lineAt(context.pos)
  const prefix = line.text.slice(0, context.pos - line.from)

  const startUrl = prefix.match(START_URL_LINE)
  if (startUrl) {
    const from = line.from + startUrl[1].length
    return {
      from,
      options: START_LINKS.map((link) => ({ label: link.url, detail: link.label, type: 'text' })),
      validFor: /^\S*$/u,
    }
  }

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
    return { from: directive.from, options: directiveOptions(workflowContextAt(source, context.pos)), validFor: /^@[A-Za-z]*$/u }
  }

  if (context.explicit) return { from: context.pos, options: directiveOptions(workflowContextAt(source, context.pos)) }
  return null
}

export const validateAnyWorkflowSource = validateWorkflowSource

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
