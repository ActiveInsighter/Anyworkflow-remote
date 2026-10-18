/** Run/Task level parsing: directives, `@for` ranges and block extraction, as the cloud compiler sees them. */
import { DiagnosticCollector } from './diagnostics.ts'
import { UTF8_ENCODER, globalLine, lineEnd, matchingBrace, normalizeNewlines, stripQuotes, substitute } from './text.ts'
import { DEFAULT_START_URL, START_URL_VARIABLE, VARIABLE_DECLARATION, WORKFLOW_DSL_LIMITS, type CloudBlock, type CloudBlockKind, type CloudConfig, type CloudLevel, type CloudLevelResult, type ParseBudget, type TemplateVars } from './types.ts'

export function parseRangeValues(
  args: string,
  collector: DiagnosticCollector,
  line: number,
  maxItems: number,
  emptyMessage?: string,
): number[] | null {
  const parts = args.split(',').map((part) => part.trim())
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => part === '')) {
    collector.add(line, 'range 必须使用 range(stop)、range(start, stop) 或 range(start, stop, step)。')
    return null
  }

  const numbers = parts.map((part) => Number(part))
  if (numbers.some((value) => !Number.isSafeInteger(value))) {
    collector.add(line, 'range 参数必须全部是整数。')
    return null
  }

  const start = numbers.length === 1 ? 0 : numbers[0] as number
  const stop = numbers.length === 1 ? numbers[0] as number : numbers[1] as number
  const step = numbers.length === 3 ? numbers[2] as number : 1
  if (step === 0) {
    collector.add(line, 'range 的 step 不能为 0。')
    return null
  }

  if ((step > 0 && start > stop) || (step < 0 && start < stop)) {
    if (emptyMessage) collector.add(line, emptyMessage)
    return []
  }

  const count = Math.floor(Math.abs(stop - start) / Math.abs(step)) + 1
  if (!Number.isSafeInteger(count) || count > maxItems) {
    collector.add(line, `range 最多只能生成 ${maxItems} 项。`)
    return null
  }
  return Array.from({ length: count }, (_, index) => start + index * step)
}

export function parseClosingLine(line: string): { braceCount: number; repeatCount: number | null } | null {
  const match = line.match(/^(\}+)(?:\*(\d+))?$/u)
  if (!match?.[1]) return null
  return { braceCount: match[1].length, repeatCount: match[2] === undefined ? null : Number(match[2]) }
}

/**
 * An empty start_url is not an error: the Run's default link is used and the author is warned.
 * Anything else must be an https link, matching what the cloud compiler accepts.
 */
function resolveStartUrl(value: string, fallback: string, collector: DiagnosticCollector, line: number): string {
  if (value === '') {
    collector.add(line, `${START_URL_VARIABLE} 为空，将使用默认链接 ${fallback}。`, 'warning')
    return fallback
  }
  try {
    if (new URL(value).protocol === 'https:') return value
  } catch {
    // Falls through to the shared error below.
  }
  collector.add(line, `${START_URL_VARIABLE} 必须是 https:// 链接。`)
  return value
}

export function parseCloudDirective(
  line: string,
  config: CloudConfig,
  vars: TemplateVars,
  allowedTitleDirective: CloudLevel,
  collector: DiagnosticCollector,
  globalLineNumber: number,
  defaultStartUrl: string = DEFAULT_START_URL,
): boolean {
  const title = line.match(new RegExp(`^@${allowedTitleDirective}\\s*=\\s*(.*?)\\s*$`, 'iu'))
  if (title) {
    config.title = stripQuotes(substitute(title[1] ?? '', vars))
    return true
  }

  const mode = line.match(/^@mode\s*=\s*(.*?)\s*$/iu)
  if (mode) {
    const value = substitute(mode[1] ?? '', vars).trim().toLowerCase()
    if (value !== 'serial' && value !== 'parallel') {
      collector.add(globalLineNumber, '@mode 只能是 serial 或 parallel。')
    } else {
      config.executionMode = value
    }
    return true
  }

  const concurrency = line.match(/^@maxConcurrency\s*=\s*(.*?)\s*$/iu)
  if (concurrency) {
    const value = substitute(concurrency[1] ?? '', vars).trim()
    const parsed = Number(value)
    if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 16) {
      collector.add(globalLineNumber, '@maxConcurrency 必须是 1–16 的正整数。')
    } else {
      config.maxConcurrency = parsed
    }
    return true
  }

  const variable = line.match(VARIABLE_DECLARATION)
  if (variable) {
    const name = variable[1] as string
    if (allowedTitleDirective !== 'task') {
      collector.add(globalLineNumber, '@let 只能定义在 Task 层级。')
    } else {
      vars[name] = name === START_URL_VARIABLE
        ? resolveStartUrl(substitute(variable[2] ?? '', vars), defaultStartUrl, collector, globalLineNumber)
        : substitute(variable[2] ?? '', vars)
    }
    return true
  }

  return false
}

export function parseCloudLevel(
  text: string,
  options: {
    level: CloudLevel
    titleDirective: CloudLevel
    blockKinds: CloudBlockKind[]
    inheritedVars?: TemplateVars
    lineBase: number
    depth: number
    budget: ParseBudget
    collector: DiagnosticCollector
    defaultTitle?: string
    defaultStartUrl?: string
  },
): CloudLevelResult {
  const vars: TemplateVars = { ...(options.inheritedVars ?? {}) }
  const config: CloudConfig = {
    title: options.defaultTitle ?? '',
    executionMode: 'serial',
    maxConcurrency: 1,
  }
  const blocks: CloudBlock[] = []
  let failed = false

  if (options.depth > WORKFLOW_DSL_LIMITS.maxNesting) {
    options.collector.add(options.lineBase + 1, `工作流循环嵌套不能超过 ${WORKFLOW_DSL_LIMITS.maxNesting} 层。`)
    return { config, vars, blocks, failed: true }
  }

  const blockPattern = options.blockKinds
    .map((kind) => kind.replace(/[.*+?^\${}()|[\]\\]/gu, '\\$&'))
    .join('|')
  const blockPatternMatcher = new RegExp(`^@(${blockPattern})(?:\\s+(.+?))?\\s*\\{\\s*$`, 'iu')
  const maxBlocks = options.level === 'run'
    ? WORKFLOW_DSL_LIMITS.maxRunTasks + 1
    : WORKFLOW_DSL_LIMITS.maxTaskEvents + 1
  let cursor = 0
  let seenBlock = false
  const budget = options.budget

  while (cursor < text.length) {
    const end = lineEnd(text, cursor)
    const rawLine = text.slice(cursor, end)
    const trimmed = rawLine.trim()
    const next = end < text.length ? end + 1 : end
    const currentLine = globalLine(text, cursor, options.lineBase)

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      cursor = next
      continue
    }

    if (!seenBlock && parseCloudDirective(trimmed, config, vars, options.titleDirective, options.collector, currentLine, options.defaultStartUrl)) {
      if (options.collector.items.some((item) => item.line === currentLine && item.severity === 'error')) failed = true
      cursor = next
      continue
    }

    const blockMatch = trimmed.match(blockPatternMatcher)
    const loopMatch = trimmed.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\((.*?)\)\s*\{\s*$/iu)
    if (blockMatch || loopMatch) {
      seenBlock = true
      const openAt = cursor + rawLine.indexOf('{')
      const closeAt = matchingBrace(text, openAt)
      if (closeAt < 0) {
        options.collector.add(currentLine, `@${blockMatch?.[1] ?? 'for'} 块缺少结束的 }。`)
        failed = true
        break
      }

      const body = text.slice(openAt + 1, closeAt)
      const bodyLineBase = globalLine(text, openAt, options.lineBase) - 1
      if (blockMatch) {
        const expandedBody = substitute(body, vars)
        budget.expandedBytes += UTF8_ENCODER.encode(expandedBody).byteLength
        if (budget.expandedBytes > WORKFLOW_DSL_LIMITS.maxExpandedPlanBytes) {
          options.collector.add(currentLine, '展开后的工作流定义超过 32 MiB。')
          failed = true
          break
        }
        blocks.push({
          kind: String(blockMatch[1] ?? options.blockKinds[0]).toLowerCase() as CloudBlockKind,
          title: stripQuotes(substitute(blockMatch[2] ?? '', vars)),
          body: expandedBody,
          line: currentLine,
        })
        if (blocks.length > maxBlocks) {
          options.collector.add(currentLine, options.level === 'run'
            ? 'Run 最多只能生成 256 个 Task。'
            : 'Task 最多只能生成 1000 个 Event。')
          failed = true
          break
        }
      } else {
        const name = loopMatch?.[1] ?? ''
        const args = substitute(loopMatch?.[2] ?? '', vars)
        const values = parseRangeValues(args, options.collector, currentLine, WORKFLOW_DSL_LIMITS.maxLoopItems)
        if (values === null) {
          failed = true
          break
        }
        for (const value of values) {
          budget.iterations += 1
          if (budget.iterations > WORKFLOW_DSL_LIMITS.maxExpansionIterations) {
            options.collector.add(currentLine, '循环展开次数过多，已停止校验。')
            failed = true
            break
          }
          const loopVars: TemplateVars = {
            ...vars,
            [name]: value,
            index: value,
            count: values.length,
          }
          const nested = parseCloudLevel(substitute(body, loopVars), {
            ...options,
            inheritedVars: loopVars,
            lineBase: bodyLineBase,
            depth: options.depth + 1,
          })
          blocks.push(...nested.blocks)
          if (blocks.length > maxBlocks) {
            options.collector.add(currentLine, options.level === 'run'
              ? 'Run 最多只能生成 256 个 Task。'
              : 'Task 最多只能生成 1000 个 Event。')
            failed = true
            break
          }
          failed ||= nested.failed
          if (nested.failed) break
        }
      }
      cursor = closeAt + 1
      continue
    }

    if (trimmed.startsWith('@')) {
      options.collector.add(currentLine, `不支持的 ${options.level === 'run' ? 'Run' : 'Task'} 指令：${trimmed}`)
    } else {
      const allowed = options.blockKinds.map((kind) => `@${kind}`).join('、')
      options.collector.add(currentLine, `此层级只能包含指令和 ${allowed} 块。`)
    }
    failed = true
    cursor = next
  }

  if (config.executionMode === 'serial') config.maxConcurrency = 1
  return { config, vars, blocks, failed }
}

export function removeLeadingEventHeaders(body: string): { taskTitle: string; eventTitle: string; body: string } {
  const lines = normalizeNewlines(body).split('\n')
  let taskTitle = ''
  let eventTitle = ''
  const remaining: string[] = []
  let scanning = true

  for (const line of lines) {
    const trimmed = line.trim()
    if (scanning) {
      if (!trimmed) continue
      const task = trimmed.match(/^@task\s*=\s*(.*?)\s*$/iu)
      if (task) {
        taskTitle = stripQuotes(task[1] ?? '')
        continue
      }
      const event = trimmed.match(/^@event\s*=\s*(.*?)\s*$/iu)
      if (event) {
        eventTitle = stripQuotes(event[1] ?? '')
        continue
      }
      scanning = false
    }
    remaining.push(line)
  }
  return { taskTitle, eventTitle, body: remaining.join('\n').trim() }
}
