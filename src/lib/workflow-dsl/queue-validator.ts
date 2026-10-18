/** Event queue validation for the browser executor, including expansion budgets. */
import { parseRangeValues } from './cloud-parser.ts'
import { fenceAt, lineEnd, matchingBrace, nextLine, normalizeNewlines } from './text.ts'
import { BACKTICK_FENCE, SELF_URL_TOKENS, TILDE_FENCE, VARIABLE_DECLARATION, VARIABLE_TOKEN, WORKFLOW_DSL_LIMITS, type QueueValidationOptions } from './types.ts'

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

export function startsWithStructuredQueueToken(value: string): boolean {
  const text = value.trimStart()
  if (!text) return false
  if (text.startsWith('{') || text.startsWith(BACKTICK_FENCE) || text.startsWith(TILDE_FENCE)) return true
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

export function queueBlockHeader(line: string): 'act' | 'for' | null {
  if (/^@act\s*\{\s*$/iu.test(line)) return 'act'
  if (/^@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\(.*?\)\s*\{\s*$/iu.test(line)) return 'for'
  return null
}

export function isQueueMetadataDirective(line: string): 'task' | 'event' | 'repeat' | 'start' | 'step' | null {
  const match = line.match(/^@(task|event|repeat|start|step)\s*=\s*(.*?)\s*$/iu)
  return (match?.[1]?.toLowerCase() as 'task' | 'event' | 'repeat' | 'start' | 'step' | undefined) ?? null
}

export function addQueueError(options: QueueValidationOptions, detail: string): void {
  options.collector.add(options.line, `Event ${options.eventTitle || '未命名'} 队列${detail}。`)
}

export function addQueueActCount(options: QueueValidationOptions, count: number): void {
  const budget = options.expansionBudget
  if (!budget || (options.depth ?? 0) > 0 || (options.pollDepth ?? 0) > 0 || count <= 0) return
  budget.acts += count
  const max = WORKFLOW_DSL_LIMITS.maxBrowserTotalActs
  if (budget.acts > max) addQueueError(options, `展开后的 Act 数量不能超过 ${max}`)
}

export function leadingQueueRepeat(value: string): number | null {
  let repeat: number | null = null
  for (const rawLine of normalizeNewlines(value).split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^@repeat\s*=\s*(.*?)\s*$/iu)
    if (match) {
      const parsed = Number(match[1])
      if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= WORKFLOW_DSL_LIMITS.maxBrowserTemplateActs) {
        repeat = parsed
      }
      continue
    }
    if (/^@(task|event|start|step|let|var)(?:\s|=)/iu.test(line)) continue
    break
  }
  return repeat
}

export function collectLeadingQueueVariables(text: string, variables: Set<string>): void {
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const declaration = line.match(VARIABLE_DECLARATION)
    if (declaration?.[1]) {
      variables.add(declaration[1])
      continue
    }
    if (/^@(task|event|repeat|start|step)\s*=/iu.test(line)) continue
    break
  }
}

export function validateQueueMetadata(
  kind: 'repeat' | 'start' | 'step',
  rawValue: string,
  options: QueueValidationOptions,
): void {
  const parsed = Number(rawValue.trim())
  if (!Number.isInteger(parsed)) {
    addQueueError(options, `中的 @${kind} 必须是整数`)
    return
  }
  if (kind === 'repeat' && (parsed < 1 || parsed > WORKFLOW_DSL_LIMITS.maxBrowserTemplateActs)) {
    addQueueError(options, `中的 @repeat 必须是 1–${WORKFLOW_DSL_LIMITS.maxBrowserTemplateActs}`)
  }
  if (kind === 'step' && parsed === 0) addQueueError(options, '中的 @step 不能为 0')
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

export function consumeQueueRepeatSuffix(text: string, at: number, options: QueueValidationOptions): { next: number; repeat: number } {
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
  }
  return { next: cursor, repeat: Number.isSafeInteger(repeat) && repeat > 0 ? repeat : 1 }
}

export function validateQueueBody(value: string, options: QueueValidationOptions): boolean {
  const text = normalizeNewlines(value).trim()
  if (!text) {
    addQueueError(options, '没有可执行消息')
    return false
  }

  let cursor = 0
  let leading = true
  let executable = false
  const depth = options.depth ?? 0
  const pollDepth = options.pollDepth ?? 0
  const activeVariables = new Set(options.activeVariables ?? [])
  collectLeadingQueueVariables(text, activeVariables)
  const topLevel = depth === 0 && pollDepth === 0
  let topLevelLooseSeen = false
  let leadingRepeat = 1

  if (depth > WORKFLOW_DSL_LIMITS.maxNesting) {
    addQueueError(options, `执行块嵌套不能超过 ${WORKFLOW_DSL_LIMITS.maxNesting} 层`)
    return false
  }
  if (pollDepth > WORKFLOW_DSL_LIMITS.maxBrowserPollDepth) {
    addQueueError(options, `消息轮询嵌套不能超过 ${WORKFLOW_DSL_LIMITS.maxBrowserPollDepth} 层`)
    return false
  }

  while (cursor < text.length) {
    while (cursor < text.length && /\s/u.test(text[cursor] ?? '')) cursor += 1
    if (cursor >= text.length) break

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
      validateBrowserTemplateTokens(content, { ...options, activeVariables })
      executable = true
      if (topLevel) topLevelLooseSeen = true
      leading = false
      cursor = fenced.next
      continue
    }

    if (text[cursor] === '{') {
      const currentPollDepth = pollDepth + 1
      if (currentPollDepth > WORKFLOW_DSL_LIMITS.maxBrowserPollDepth) {
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
      validateBrowserTemplateTokens(content, { ...options, activeVariables })
      const repeat = consumeQueueRepeatSuffix(text, closeAt + 1, options)
      if (startsWithStructuredQueueToken(content)) {
        validateQueueBody(content, {
          ...options,
          activeVariables,
          pollDepth: pollDepth + 1,
        })
      }
      executable = true
      if (topLevel) topLevelLooseSeen = true
      leading = false
      cursor = repeat.next
      continue
    }

    const end = lineEnd(text, cursor)
    const rawLine = text.slice(cursor, end)
    const line = rawLine.trim()

    if (queueUrlIsExecutable(line)) {
      executable = true
      if (topLevel) topLevelLooseSeen = true
      leading = false
      cursor = end < text.length ? end + 1 : end
      continue
    }

    if (leading && /^@(?:let|var)\b/iu.test(line)) {
      const declaration = line.match(VARIABLE_DECLARATION)
      if (!declaration?.[1]) {
        addQueueError(options, '包含无效的 @let 声明')
        return false
      }
      activeVariables.add(declaration[1])
      cursor = end < text.length ? end + 1 : end
      continue
    }

    if (leading && /^@action\s*=/iu.test(line)) {
      addQueueError(options, '中的 @action 已不再支持，请使用原有的 @event=名称语法')
      return false
    }

    const metadata = isQueueMetadataDirective(line)
    if (leading && metadata) {
      if (metadata === 'task' || metadata === 'event') {
        const rawValue = line.replace(/^@[^=]+=/u, '')
        validateBrowserTemplateTokens(rawValue, { ...options, activeVariables })
      }
      if (metadata === 'repeat' || metadata === 'start' || metadata === 'step') {
        const rawValue = line.replace(/^@[^=]+=\s*/u, '')
        validateQueueMetadata(metadata, rawValue, options)
        if (metadata === 'repeat' && leading) {
          const parsed = Number(rawValue.trim())
          if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= WORKFLOW_DSL_LIMITS.maxBrowserTemplateActs) {
            leadingRepeat = parsed
          }
        }
      }
      cursor = end < text.length ? end + 1 : end
      continue
    }

    const block = queueBlockHeader(line)
    if (block) {
      const openAt = cursor + rawLine.indexOf('{')
      const closeAt = matchingBrace(text, openAt)
      if (closeAt < 0) {
        addQueueError(options, '包含未闭合的执行块')
        return false
      }

      if (block === 'act' && depth > 0) {
        addQueueError(options, '中的 @act 只能直接位于 Event 队列层级')
        return false
      }

      if (block === 'for') {
        const loop = line.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\((.*?)\)\s*\{\s*$/iu)
        const maxItems = WORKFLOW_DSL_LIMITS.maxBrowserLoopItems
        const values = parseRangeValues(
          loop?.[2] ?? '',
          options.collector,
          options.line,
          maxItems,
          '的 range 没有生成任何消息',
        )
        if (values === null) return false
        if (depth > 0) {
          addQueueError(options, '中的 @for 只能直接位于 Event 队列层级')
          return false
        }
        if (topLevel) {
          const repeat = leadingQueueRepeat(text.slice(openAt + 1, closeAt)) ?? 1
          addQueueActCount(options, values.length * repeat)
        }
        const loopVariables = new Set(activeVariables)
        if (loop?.[1]) loopVariables.add(loop[1])
        loopVariables.add('index')
        loopVariables.add('count')
        const nested = validateQueueBody(text.slice(openAt + 1, closeAt), {
          ...options,
          activeVariables: loopVariables,
          depth: depth + 1,
        })
        if (nested && values.length > 0) executable = true
      } else {
        if (topLevel) {
          const bodyRepeat = leadingQueueRepeat(text.slice(openAt + 1, closeAt))
          const repeat = bodyRepeat ?? leadingRepeat
          addQueueActCount(options, repeat)
        }
        const nested = validateQueueBody(text.slice(openAt + 1, closeAt), {
          ...options,
          activeVariables: new Set(activeVariables),
          depth: depth + 1,
        })
        if (nested) executable = true
      }
      leading = false
      cursor = closeAt + 1
      continue
    }

    addQueueError(options, '语法无效；可执行消息必须使用代码围栏、{ ... } 消息块或 HTTPS 地址')
    return false
  }

  if (!executable) addQueueError(options, '没有可执行消息')
  if (topLevel && topLevelLooseSeen) addQueueActCount(options, leadingRepeat)
  return executable
}
