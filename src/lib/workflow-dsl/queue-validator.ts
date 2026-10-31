/**
 * Event queue validation for the browser executor.
 *
 * A body (the queue, an `@act`, one iteration of a `@for`) is a program: leading directives, then
 * messages, `@act` blocks and loops in source order. Consecutive messages form one Act, repeated
 * by the body's `@repeat`; an `@act` inherits that `@repeat` unless it sets its own; a loop never
 * does. Loops are walked with their real values because an inner header may read an outer
 * variable (`@for s in %secs%`, `range(1, %n%)`), which also lets the walk preview every Act.
 */
import { expandLoop, isLoopHeaderLine, readLoopHeader } from '../../../shared/dsl-kit/loops.mjs'
import { fenceAt, lineEnd, matchingBrace, nextLine, normalizeNewlines, substitute } from './text.ts'
import {
  BACKTICK_FENCE,
  LOOP_ALIAS_VARIABLES,
  REPEAT_VARIABLES,
  SELF_URL_TOKENS,
  TILDE_FENCE,
  VARIABLE_DECLARATION,
  VARIABLE_TOKEN,
  WORKFLOW_DSL_LIMITS,
  type ActDirectives,
  type ActPreview,
  type QueueBudget,
  type QueueValidationOptions,
  type TemplateVars,
} from './types.ts'

const PREVIEW_CHARS = 160

export function queueUrlIsExecutable(value: string): boolean {
  const token = value.trim().replace(/\s+/gu, '')
  if (SELF_URL_TOKENS.has(token.toLowerCase())) return true
  const match = token.match(/^<((?:https:\/\/)[^<>]+)>$/iu)
  if (!match) return false
  try {
    return new URL(match[1] as string).protocol === 'https:'
  } catch {
    return false
  }
}

/** Wait parameters use the existing %name% template syntax, resolved by the executor. */
export function queueSleepArgument(token: string): string | null {
  const match = token.trim().match(/^<\s*(?:sleep|wait)\s*\(\s*([^()（）<>]*?)\s*\)\s*>$/iu)
  return match ? (match[1] ?? '').trim() : null
}

export function startsWithStructuredQueueToken(value: string): boolean {
  const text = value.trimStart()
  if (!text) return false
  if (text.startsWith('{') || text.startsWith(BACKTICK_FENCE) || text.startsWith(TILDE_FENCE)) return true
  if (/^<\s*(?:sleep|wait)\b/iu.test(text)) return true
  const closeAt = text.indexOf('>')
  return closeAt >= 0 && queueUrlIsExecutable(text.slice(0, closeAt + 1))
}

export function queueFenceEnd(text: string, at: number, marker: string): { bodyStart: number; closeAt: number; next: number } | null {
  let cursor = nextLine(text, at)
  while (cursor < text.length) {
    const end = lineEnd(text, cursor)
    if (text.slice(cursor, end).trim() === marker) {
      return {
        bodyStart: nextLine(text, at),
        closeAt: cursor,
        next: end < text.length ? end + 1 : end,
      }
    }
    cursor = end < text.length ? end + 1 : end
  }
  return null
}

export function isQueueMetadataDirective(line: string): 'task' | 'event' | 'repeat' | 'start' | 'step' | null {
  const match = line.match(/^@(task|event|repeat|start|step)\s*=\s*(.*?)\s*$/iu)
  return (match?.[1]?.toLowerCase() as 'task' | 'event' | 'repeat' | 'start' | 'step' | undefined) ?? null
}

export function addQueueError(options: QueueValidationOptions, detail: string): void {
  options.collector.add(options.line, `Event ${options.eventTitle || '未命名'} 队列${detail}。`)
}

function validateQueueMetadata(kind: 'repeat' | 'start' | 'step', rawValue: string, options: QueueValidationOptions): number | null {
  const parsed = Number(rawValue.trim())
  if (!Number.isInteger(parsed)) {
    addQueueError(options, `中的 @${kind} 必须是整数`)
    return null
  }
  if (kind === 'repeat' && (parsed < 1 || parsed > WORKFLOW_DSL_LIMITS.maxBrowserTemplateActs)) {
    addQueueError(options, `中的 @repeat 必须是 1–${WORKFLOW_DSL_LIMITS.maxBrowserTemplateActs}`)
    return null
  }
  if (kind === 'step' && parsed === 0) {
    addQueueError(options, '中的 @step 不能为 0')
    return null
  }
  return parsed
}

export function validateBrowserTemplateTokens(text: string, options: QueueValidationOptions): void {
  const variables = options.activeVariables ?? new Set<string>()
  for (const match of text.matchAll(VARIABLE_TOKEN)) {
    const name = match[1] as string
    const format = match[2] as string | undefined
    if (!variables.has(name)) {
      addQueueError(options, `使用了未定义变量 %${name}%`)
      continue
    }
    if (format && format !== 'pad2' && format !== 'zh') {
      addQueueError(options, `使用了浏览器不支持的变量格式 %${name}:${format}%`)
    }
  }
}

function consumeQueueRepeatSuffix(text: string, at: number, options: QueueValidationOptions): { next: number; repeat: number } {
  let cursor = at
  while (cursor < text.length && /[ \t]/u.test(text[cursor] ?? '')) cursor += 1
  if (text[cursor] !== '*') return { next: cursor, repeat: 1 }
  cursor += 1
  const start = cursor
  while (cursor < text.length && /\d/u.test(text[cursor] ?? '')) cursor += 1
  if (cursor === start) {
    addQueueError(options, '包含无效的重复后缀')
    return { next: cursor, repeat: 1 }
  }
  const repeat = Number(text.slice(start, cursor))
  if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > WORKFLOW_DSL_LIMITS.maxQueueRepeat) {
    addQueueError(options, `的重复次数必须是 1–${WORKFLOW_DSL_LIMITS.maxQueueRepeat}`)
    return { next: cursor, repeat: 1 }
  }
  return { next: cursor, repeat }
}

/**
 * Executor nodes in a message's content: every message, link and wait is one node and a polling
 * group runs its children `*N` times. Run progress reports these node indexes.
 */
export function queueNodeCount(source: string): number {
  const text = normalizeNewlines(source)
  let total = 0
  let cursor = 0
  while (cursor < text.length) {
    while (cursor < text.length && /\s/u.test(text[cursor] ?? '')) cursor += 1
    if (cursor >= text.length) break
    const marker = fenceAt(text, cursor)
    if (marker) {
      const fenced = queueFenceEnd(text, cursor, marker)
      if (!fenced) return total
      if (text.slice(fenced.bodyStart, fenced.closeAt).trim()) total += 1
      cursor = fenced.next
      continue
    }
    if (text[cursor] === '<') {
      const end = text.indexOf('>', cursor + 1)
      if (end >= 0) {
        const token = text.slice(cursor + 1, end).trim()
        if (/^(?:https:\/\/|self$|current$|here$|本页$|当前页$|当前页面$|(?:sleep|wait)\s*\()/iu.test(token)) total += 1
        cursor = end + 1
        continue
      }
    }
    if (text[cursor] === '{') {
      const close = matchingBrace(text, cursor)
      const end = close >= 0 ? close : text.length
      const inner = text.slice(cursor + 1, end).trim()
      const base = inner ? (startsWithStructuredQueueToken(inner) ? queueNodeCount(inner) : 1) : 0
      const repeat = text.slice(end + 1).match(/^[ \t]*\*(\d+)/u)
      total += base * (repeat && Number(repeat[1]) > 0 ? Number(repeat[1]) : 1)
      cursor = end + 1 + (repeat?.[0].length ?? 0)
      continue
    }
    cursor = nextLine(text, cursor)
  }
  return total
}

function clip(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  const chars = [...flat]
  return chars.length > PREVIEW_CHARS ? `${chars.slice(0, PREVIEW_CHARS - 1).join('')}…` : flat
}

/** A run of consecutive messages: one Act per repeat. */
interface Segment {
  first: string
  messages: number
  nodes: number
}

/**
 * Charges one segment's Acts and, when asked, records them. Numbering follows the browser: with
 * `@repeat`/`@start`/`@step` the Acts rebind `i`, `index` and `count` to their own counter.
 */
function emitActs(segment: Segment, directives: ActDirectives, vars: TemplateVars, options: QueueValidationOptions): void {
  const budget = options.budget
  if (!budget || (options.pollDepth ?? 0) > 0) return
  const repeat = directives.repeat ?? 1
  const numbered = directives.repeat !== undefined || directives.start !== undefined || directives.step !== undefined
  const max = WORKFLOW_DSL_LIMITS.maxBrowserTotalActs
  for (let copy = 0; copy < repeat; copy += 1) {
    budget.acts += 1
    if (budget.acts > max) {
      if (!budget.exceeded) addQueueError(options, `展开后的 Act 数量不能超过 ${max}`)
      budget.exceeded = true
      return
    }
    if (!options.previews) continue
    const value = (directives.start ?? 1) + copy * (directives.step || 1)
    const actVars: TemplateVars = numbered
      ? { ...vars, i: value, index: value, count: repeat }
      : { i: directives.start ?? 1, index: directives.start ?? 1, count: 1, ...vars }
    options.previews.push({
      title: directives.event === undefined ? '' : clip(substitute(directives.event, actVars)),
      text: clip(substitute(segment.first, actVars)),
      messages: segment.messages,
      nodes: segment.nodes,
    })
  }
}

/** Names declared by a body's leading `@let` lines; a directive may use one declared below it. */
function leadingDeclarations(text: string): string[] {
  const names: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const declaration = line.match(VARIABLE_DECLARATION)
    if (declaration?.[1]) {
      names.push(declaration[1])
      continue
    }
    if (/^@(task|event|repeat|start|step)\s*=/iu.test(line)) continue
    break
  }
  return names
}

/** Returns false when the body is malformed (the reason is already reported). */
export function validateQueueBody(value: string, options: QueueValidationOptions): boolean {
  const text = normalizeNewlines(value).trim()
  if (!text) {
    addQueueError(options, '没有可执行消息')
    return false
  }

  const pollDepth = options.pollDepth ?? 0
  const container = options.container ?? 'queue'
  const loopNames = options.loopNames ?? []
  const budget: QueueBudget = options.budget ?? { acts: 0, walked: 0 }
  const vars: TemplateVars = { ...(options.vars ?? {}) }
  const activeVariables = new Set([...(options.activeVariables ?? []), ...leadingDeclarations(text)])
  const directives: ActDirectives = { ...(options.inherited ?? {}) }
  const scoped = (): QueueValidationOptions => ({ ...options, activeVariables, vars, budget })
  let cursor = 0
  let leading = true
  let structure = false
  let segment: Segment | null = null

  if (pollDepth > WORKFLOW_DSL_LIMITS.maxBrowserPollDepth) {
    addQueueError(options, `消息轮询嵌套不能超过 ${WORKFLOW_DSL_LIMITS.maxBrowserPollDepth} 层`)
    return false
  }

  const message = (first: string, nodes = 1) => {
    structure = true
    leading = false
    if (!segment) segment = { first, messages: 0, nodes: 0 }
    else if (!segment.first) segment.first = first
    segment.messages += first ? 1 : 0
    segment.nodes += nodes
  }
  const closeSegment = () => {
    if (segment) emitActs(segment, directives, vars, scoped())
    segment = null
  }

  while (cursor < text.length) {
    while (cursor < text.length && /\s/u.test(text[cursor] ?? '')) cursor += 1
    if (cursor >= text.length) break
    if (budget.exceeded) return true

    const marker = fenceAt(text, cursor)
    if (marker) {
      const fenced = queueFenceEnd(text, cursor, marker)
      if (!fenced) {
        addQueueError(options, '包含未闭合的代码围栏')
        return false
      }
      const content = text.slice(fenced.bodyStart, fenced.closeAt)
      if (!content.trim()) {
        addQueueError(options, '包含空代码围栏')
        return false
      }
      validateBrowserTemplateTokens(content, scoped())
      message(content.trim())
      cursor = fenced.next
      continue
    }

    if (text[cursor] === '{') {
      if (pollDepth + 1 > WORKFLOW_DSL_LIMITS.maxBrowserPollDepth) {
        addQueueError(options, `消息轮询嵌套不能超过 ${WORKFLOW_DSL_LIMITS.maxBrowserPollDepth} 层`)
        return false
      }
      const closeAt = matchingBrace(text, cursor)
      if (closeAt < 0) {
        addQueueError(options, '包含未闭合的消息块')
        return false
      }
      const content = text.slice(cursor + 1, closeAt)
      if (!content.trim()) {
        addQueueError(options, '包含空消息块')
        return false
      }
      validateBrowserTemplateTokens(content, scoped())
      const suffix = consumeQueueRepeatSuffix(text, closeAt + 1, options)
      const structured = startsWithStructuredQueueToken(content)
      if (structured) {
        validateQueueBody(content, { ...scoped(), container: 'act', pollDepth: pollDepth + 1, budget: { acts: 0, walked: 0 }, previews: undefined })
      }
      message(content.trim(), (structured ? queueNodeCount(content) : 1) * suffix.repeat)
      cursor = suffix.next
      continue
    }

    if (/^<\s*(?:sleep|wait)\b/iu.test(text.slice(cursor))) {
      const closeAt = text.indexOf('>', cursor + 1)
      const token = closeAt < 0 ? '' : text.slice(cursor, closeAt + 1)
      const argument = queueSleepArgument(token)
      if (argument === null || !/^(?:\d+(?:\.\d+)?|%[A-Za-z_][A-Za-z0-9_]*(?::(?:pad2|zh))?%)$/u.test(argument)) {
        addQueueError(options, '等待格式无效，请使用 <sleep(秒数)> 或 <wait(秒数)>')
        return false
      }
      if (argument.startsWith('%')) validateBrowserTemplateTokens(argument, scoped())
      else if (!Number.isFinite(Number(argument)) || Number(argument) > 86400) {
        addQueueError(options, '等待秒数必须为 0–86400 的数字')
        return false
      }
      message('')
      cursor = closeAt + 1
      continue
    }

    const end = lineEnd(text, cursor)
    const rawLine = text.slice(cursor, end)
    const line = rawLine.trim()
    const lineNext = end < text.length ? end + 1 : end

    if (queueUrlIsExecutable(line)) {
      message('')
      cursor = lineNext
      continue
    }

    if (leading && /^@(?:let|var)\b/iu.test(line)) {
      const declaration = line.match(VARIABLE_DECLARATION)
      if (!declaration?.[1]) {
        addQueueError(options, '包含无效的 @let 声明')
        return false
      }
      // The browser renders a declaration with the values in scope where it is written.
      vars[declaration[1]] = substitute(declaration[2] ?? '', vars)
      activeVariables.add(declaration[1])
      cursor = lineNext
      continue
    }

    if (leading && /^@action\s*=/iu.test(line)) {
      addQueueError(options, '中的 @action 已不再支持，请使用原有的 @event=名称语法')
      return false
    }

    const metadata = isQueueMetadataDirective(line)
    if (leading && metadata) {
      const rawValue = line.replace(/^@[^=]+=\s*/u, '')
      if (metadata === 'task' || metadata === 'event') {
        validateBrowserTemplateTokens(rawValue, scoped())
        if (metadata === 'event') directives.event = rawValue
      } else {
        const parsed = validateQueueMetadata(metadata, rawValue, options)
        if (parsed !== null) directives[metadata] = parsed
        for (const name of REPEAT_VARIABLES) activeVariables.add(name)
      }
      cursor = lineNext
      continue
    }

    const isAct = /^@act\s*\{\s*$/iu.test(line)
    const loop = isAct || !isLoopHeaderLine(line) ? null : readLoopHeader(text, cursor + rawLine.indexOf(line))
    if (loop && !loop.ok) {
      addQueueError(options, `的 @for 写法有误：${loop.error}`)
      return false
    }
    if (isAct || loop) {
      if (pollDepth > 0 || container === 'act') {
        addQueueError(options, `中的 @${isAct ? 'act' : 'for'} 不能放在 @act 或消息块里`)
        return false
      }
      const openAt = loop ? loop.openAt : cursor + rawLine.indexOf('{')
      const closeAt = matchingBrace(text, openAt)
      if (closeAt < 0) {
        addQueueError(options, '包含未闭合的执行块')
        return false
      }
      const innerBody = text.slice(openAt + 1, closeAt)
      closeSegment()
      structure = true
      leading = false
      cursor = closeAt + 1

      if (isAct) {
        const actOptions: QueueValidationOptions = {
          ...scoped(),
          activeVariables: new Set(activeVariables),
          container: 'act',
          inherited: directives,
        }
        if (!validateQueueBody(innerBody, actOptions)) return false
        continue
      }

      if ((options.loopDepth ?? 0) >= WORKFLOW_DSL_LIMITS.maxLoopNesting) {
        addQueueError(options, `中的 @for 最多嵌套 ${WORKFLOW_DSL_LIMITS.maxLoopNesting} 层`)
        return false
      }
      const reused = loop!.names.find((name) => loopNames.includes(name))
      if (reused) {
        addQueueError(options, `中的 @for 变量 ${reused} 已被外层 @for 使用，请换一个名称`)
        return false
      }
      const expansion = expandLoop(loop!, vars, { maxItems: WORKFLOW_DSL_LIMITS.maxBrowserLoopItems })
      if (!expansion.ok) {
        addQueueError(options, `的 @for ${expansion.error}`)
        return false
      }
      const loopVariables = new Set(activeVariables)
      for (const name of [...loop!.names, ...LOOP_ALIAS_VARIABLES]) loopVariables.add(name)
      for (const binding of expansion.iterations) {
        budget.walked += 1
        if (budget.walked > WORKFLOW_DSL_LIMITS.maxQueueLoopWalk) {
          addQueueError(options, `的循环展开次数超过 ${WORKFLOW_DSL_LIMITS.maxQueueLoopWalk}`)
          return false
        }
        const iteration = validateQueueBody(innerBody, {
          ...scoped(),
          activeVariables: loopVariables,
          vars: { ...vars, ...binding },
          container: 'for',
          loopDepth: (options.loopDepth ?? 0) + 1,
          loopNames: [...loopNames, ...loop!.names],
          inherited: { event: directives.event },
        })
        if (!iteration) return false
        if (budget.exceeded) return true
      }
      continue
    }

    addQueueError(options, '语法无效；可执行消息必须使用代码围栏、{ ... } 消息块或 HTTPS 地址')
    return false
  }

  if (!structure) {
    addQueueError(options, '没有可执行消息')
    return false
  }
  closeSegment()
  return true
}

/** Validates a whole Event queue and returns its Acts; at least one Act must remain. */
export function walkEventQueue(body: string, options: QueueValidationOptions): { ok: boolean; acts: ActPreview[]; actCount: number } {
  const previews: ActPreview[] = []
  const budget: QueueBudget = { acts: 0, walked: 0 }
  const ok = validateQueueBody(body, { ...options, budget, previews, container: 'queue' })
  if (ok && !budget.exceeded && budget.acts === 0) addQueueError(options, '没有生成任何 Act：所有循环都是空的')
  return { ok: ok && budget.acts > 0, acts: previews, actCount: budget.acts }
}
