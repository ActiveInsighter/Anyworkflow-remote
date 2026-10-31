/** Cursor context and in-scope variables for completions and insertion tools. */
import { isLoopHeaderLine, readLoopHeader } from '../../../shared/dsl-kit/loops.mjs'
import { parseClosingLine } from './cloud-parser.ts'
import { lineEnd, normalizeNewlines } from './text.ts'
import { LOOP_ALIAS_VARIABLES, type WorkflowDslContext } from './types.ts'

interface ScanLine {
  /** The trimmed line; a multi-line `@for` header is one entry. */
  text: string
  /** Names bound by the `@for` header this line opens. */
  loop?: string[]
}

/**
 * Lines before `at`, trimmed, with each `@for` header (which may span lines when its list does)
 * folded into one entry. A cursor inside an unfinished header stops the scan there.
 */
function scanLines(source: string, at: number): ScanLine[] {
  const text = normalizeNewlines(source)
  const stop = Math.max(0, Math.min(at, text.length))
  const lines: ScanLine[] = []
  let fence = ''
  let cursor = 0
  while (cursor <= stop && cursor < text.length) {
    const end = lineEnd(text, cursor)
    const raw = text.slice(cursor, Math.min(end, stop))
    const trimmed = raw.trim()
    const marker = trimmed.match(/^(?:```|~~~)/u)?.[0] ?? ''
    if (fence) {
      if (trimmed === fence) fence = ''
    } else if (marker) {
      fence = marker
    } else if (isLoopHeaderLine(trimmed)) {
      const header = readLoopHeader(text, cursor + raw.indexOf(trimmed))
      if (header?.ok) {
        if (header.openAt >= stop) break
        lines.push({ text: trimmed, loop: header.names })
        cursor = lineEnd(text, header.openAt) + 1
        continue
      }
    }
    lines.push({ text: trimmed })
    if (end >= stop) break
    cursor = end + 1
  }
  return lines
}

/** Context used by completions and insertion tools; it recognizes the same block forms as the validator. */
export function workflowContextAt(source: string, at: number): WorkflowDslContext {
  const stack: Array<'task' | 'event' | 'for-task' | 'for-event'> = []
  let inFence = false
  let queueDepth = 0

  for (const { text: line, loop } of scanLines(source, at)) {
    if (/^(?:```|~~~)/u.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || !line) continue

    const top = stack.at(-1)
    const context: WorkflowDslContext = top === 'event' ? 'event' : top === 'task' || top === 'for-event' ? 'task' : 'run'
    if (context === 'event') {
      if (loop || /^(?:@act\s*\{|\{)\s*$/iu.test(line)) {
        queueDepth += 1
        continue
      }
      const closing = parseClosingLine(line)
      if (closing) {
        let remaining = closing.braceCount
        while (remaining > 0) {
          if (queueDepth > 0) queueDepth -= 1
          else if (stack.at(-1) === 'event') stack.pop()
          remaining -= 1
        }
      }
      continue
    }

    if (/^@(task)(?:\s+.*?)?\s*\{\s*$/iu.test(line)) {
      stack.push('task')
      continue
    }
    if (/^@event(?:\s+.*?)?\s*\{\s*$/iu.test(line)) {
      stack.push('event')
      continue
    }
    if (loop) {
      stack.push(context === 'run' ? 'for-task' : 'for-event')
      continue
    }
    const closing = parseClosingLine(line)
    if (closing) {
      for (let index = 0; index < closing.braceCount && stack.length; index += 1) stack.pop()
    }
  }

  const top = stack.at(-1)
  if (top === 'event') return 'event'
  if (top === 'task' || top === 'for-event') return 'task'
  return 'run'
}

export interface VariableScope {
  kind: 'run' | 'task' | 'event' | 'act' | 'message' | 'for-task' | 'for-event' | 'for-queue'
  /** Variables declared with `@let` / `@var` inside this scope. */
  variables: Set<string>
  /** Names bound by `@for <names> in ...`; a loop also brings the aliases into scope. */
  loopVariables?: string[]
}

/** A variable usable at the cursor, with where it comes from so tools can label it truthfully. */
export interface WorkflowVariable {
  name: string
  origin: 'declared' | 'loop' | 'loop-alias'
  /** The first variable of the loop an alias belongs to. */
  loop?: string
  /** For an alias: whether the loop iterates a list (1-based position) or a range (the value). */
  loopKind?: 'list' | 'range'
}

export function variableContext(frames: VariableScope[]): WorkflowDslContext {
  const kind = frames.at(-1)?.kind ?? 'run'
  if (kind === 'event' || kind === 'act' || kind === 'message' || kind === 'for-queue') return 'event'
  if (kind === 'task' || kind === 'for-event') return 'task'
  return 'run'
}

/** Completion scope follows the same valid declarations as the cloud plan compiler. */
export function collectWorkflowVariableScope(source: string, at: number): WorkflowVariable[] {
  const frames: Array<VariableScope & { loopKind?: 'list' | 'range' }> = [{ kind: 'run', variables: new Set<string>() }]
  let inFence = false

  for (const { text: line, loop } of scanLines(source, at)) {
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

    const context = variableContext(frames)
    const variable = line.match(/^@(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/iu)
    if (variable?.[1] && (context === 'task' || ['event', 'act', 'for-queue'].includes(frames.at(-1)?.kind ?? ''))) {
      frames.at(-1)?.variables.add(variable[1])
    }

    if (loop) {
      frames.push({
        kind: context === 'run' ? 'for-task' : context === 'task' ? 'for-event' : 'for-queue',
        variables: new Set<string>(),
        loopVariables: loop,
        loopKind: /\bin\s+range\s*\(/iu.test(line) ? 'range' : 'list',
      })
      continue
    }
    if (/^@(task)(?:\s+.*?)?\s*\{\s*$/iu.test(line)) {
      frames.push({ kind: 'task', variables: new Set<string>() })
      continue
    }
    if (/^@event(?:\s+.*?)?\s*\{\s*$/iu.test(line)) {
      frames.push({ kind: 'event', variables: new Set<string>() })
      continue
    }
    if (/^@act\s*\{\s*$/iu.test(line)) frames.push({ kind: 'act', variables: new Set<string>() })
    else if (/^\{\s*$/u.test(line)) frames.push({ kind: 'message', variables: new Set<string>() })
  }

  const visible = new Map<string, WorkflowVariable>()
  for (const frame of frames) {
    for (const name of frame.variables) visible.set(name, { name, origin: 'declared' })
    for (const name of frame.loopVariables ?? []) visible.set(name, { name, origin: 'loop' })
  }
  // Inside a loop the aliases belong to the innermost loop and win over a same-named declaration,
  // exactly as the compiler and the browser bind them.
  const innermost = [...frames].reverse().find((frame) => frame.loopVariables?.length)
  if (innermost?.loopVariables) {
    for (const name of LOOP_ALIAS_VARIABLES) {
      visible.set(name, { name, origin: 'loop-alias', loop: innermost.loopVariables[0], loopKind: innermost.loopKind })
    }
  }
  return [...visible.values()]
}

export function collectWorkflowVariables(source: string, at: number): string[] {
  return collectWorkflowVariableScope(source, at).map((variable) => variable.name)
}
