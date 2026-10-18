/** Cursor context and in-scope variables for completions and insertion tools. */
import { parseClosingLine } from './cloud-parser.ts'
import { normalizeNewlines } from './text.ts'
import type { WorkflowDslContext } from './types.ts'

/** Context used by completions and insertion tools; it recognizes the same block forms as the validator. */
export function workflowContextAt(source: string, at: number): WorkflowDslContext {
  const prefix = normalizeNewlines(source.slice(0, Math.max(0, Math.min(at, source.length))))
  const stack: Array<'task' | 'event' | 'for-task' | 'for-event'> = []
  let inFence = false
  let queueDepth = 0

  for (const raw of prefix.split('\n')) {
    const line = raw.trim()
    if (/^(?:```|~~~)/u.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || !line) continue

    const top = stack.at(-1)
    const context: WorkflowDslContext = top === 'event' ? 'event' : top === 'task' || top === 'for-event' ? 'task' : 'run'
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
    if (/^@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\([^)]*\)\s*\{\s*$/iu.test(line)) {
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
  variables: Set<string>
}

export function variableContext(frames: VariableScope[]): WorkflowDslContext {
  const kind = frames.at(-1)?.kind ?? 'run'
  if (kind === 'event' || kind === 'act' || kind === 'message' || kind === 'for-queue') return 'event'
  if (kind === 'task' || kind === 'for-event') return 'task'
  return 'run'
}

/** Completion scope follows the same valid declarations as the cloud plan compiler. */
export function collectWorkflowVariables(source: string, at: number): string[] {
  const frames: VariableScope[] = [{ kind: 'run', variables: new Set<string>() }]
  const prefix = normalizeNewlines(source.slice(0, Math.max(0, Math.min(at, source.length))))
  let inFence = false

  for (const raw of prefix.split('\n')) {
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

    const context = variableContext(frames)
    const variable = line.match(/^@var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/iu)
    if (variable?.[1] && (context === 'task' || ['event', 'act', 'for-queue'].includes(frames.at(-1)?.kind ?? ''))) {
      frames.at(-1)?.variables.add(variable[1])
    }

    const loop = line.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\([^)]*\)\s*\{/iu)
    if (loop?.[1]) {
      frames.push({
        kind: context === 'run' ? 'for-task' : context === 'task' ? 'for-event' : 'for-queue',
        variables: new Set([loop[1], 'index', 'count']),
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

  const visible = new Set<string>()
  for (const frame of frames) for (const name of frame.variables) visible.add(name)
  return [...visible]
}
