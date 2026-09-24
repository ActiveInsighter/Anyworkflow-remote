import type { DispatchExecutionMode, PlanMeta } from '../types'

export type WorkflowDslContext = 'run' | 'task' | 'event'
export type WorkflowDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface WorkflowDiagnostic {
  from: number
  to: number
  line: number
  severity: WorkflowDiagnosticSeverity
  message: string
}

/**
 * These limits mirror the cloud compiler and the browser queue parser. The editor deliberately
 * validates the stricter limit when the same source is accepted by one layer but rejected by the
 * next one, so a plan cannot pass the editor only to fail after orchestration.
 */
export const WORKFLOW_DSL_LIMITS = Object.freeze({
  maxPlanBytes: 2 * 1024 * 1024,
  maxRunTasks: 256,
  maxTaskEvents: 1_000,
  maxLoopItems: 1_000,
  maxNesting: 8,
  maxEventQueueBytes: 768 * 1024,
  maxExpandedPlanBytes: 32 * 1024 * 1024,
  maxQueueRepeat: 30,
  maxBrowserLoopItems: 200,
  maxBrowserTotalActs: 200,
  maxBrowserPollDepth: 3,
  maxBrowserTemplateActs: 10,
  maxCodexActs: 1_000,
  maxCodexMessagesPerAct: 1_000,
  maxExpansionIterations: 100_000,
})

const SELF_URL_TOKENS = new Set(['<self>', '<current>', '<here>', '<本页>', '<当前页>', '<当前页面>'])
const VARIABLE_TOKEN = /%([A-Za-z_][A-Za-z0-9_]*)(?::([A-Za-z0-9_]+))?%/gu
const BACKTICK_FENCE = '```'
const TILDE_FENCE = '~~~'

type TemplateValue = string | number
type TemplateVars = Record<string, TemplateValue>
type CloudLevel = 'run' | 'task'
type CloudBlockKind = 'task' | 'codex' | 'event'
type QueueFlavor = 'browser' | 'codex'

interface LineIndex {
  readonly original: string
  readonly starts: number[]
}

interface CloudConfig {
  title: string
  executionMode: DispatchExecutionMode
  maxConcurrency: number
}

interface CloudBlock {
  kind: CloudBlockKind
  title: string
  body: string
  line: number
}

interface CloudLevelResult {
  config: CloudConfig
  vars: TemplateVars
  blocks: CloudBlock[]
  failed: boolean
}

interface ParseBudget {
  expandedBytes: number
  iterations: number
}

interface QueueValidationOptions {
  flavor: QueueFlavor
  eventTitle: string
  line: number
  collector: DiagnosticCollector
  activeVariables?: Set<string>
  depth?: number
  pollDepth?: number
  expansionBudget?: QueueExpansionBudget
  codexPromptBudget?: QueuePromptBudget
  codexPromptMultiplier?: number
}

interface QueueExpansionBudget {
  acts: number
}

interface QueuePromptBudget {
  prompts: number
}

const UTF8_ENCODER = new TextEncoder()

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/gu, '\n')
}

function createLineIndex(source: string): LineIndex {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return { original: source, starts }
}

function lineRange(index: LineIndex, lineNumber: number): { from: number; to: number } {
  const lineIndex = Math.max(0, Math.min(lineNumber - 1, index.starts.length - 1))
  const from = index.starts[lineIndex] ?? 0
  const newline = index.original.indexOf('\n', from)
  const rawTo = newline < 0 ? index.original.length : newline
  return { from, to: Math.max(from, rawTo) }
}

class DiagnosticCollector {
  readonly items: WorkflowDiagnostic[] = []
  private readonly seen = new Set<string>()
  private readonly index: LineIndex

  constructor(source: string) {
    this.index = createLineIndex(source)
  }

  add(line: number, message: string, severity: WorkflowDiagnosticSeverity = 'error'): void {
    const safeLine = Math.max(1, line)
    const key = `${safeLine}:${severity}:${message}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    const range = lineRange(this.index, safeLine)
    this.items.push({
      from: range.from,
      to: range.to > range.from ? range.to : Math.min(this.index.original.length, range.from + 1),
      line: safeLine,
      severity,
      message,
    })
  }

  get hasErrors(): boolean {
    return this.items.some((item) => item.severity === 'error')
  }
}

function lineNumber(text: string, at: number): number {
  let line = 1
  for (let index = 0; index < at && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1
  }
  return line
}

function globalLine(text: string, at: number, lineBase: number): number {
  return lineBase + lineNumber(text, at)
}

function lineEnd(text: string, at: number): number {
  const end = text.indexOf('\n', at)
  return end < 0 ? text.length : end
}

function nextLine(text: string, at: number): number {
  const end = lineEnd(text, at)
  return end < text.length ? end + 1 : end
}

function isLineStart(text: string, at: number): boolean {
  let index = at - 1
  while (index >= 0 && (text[index] === ' ' || text[index] === '\t')) index -= 1
  return index < 0 || text[index] === '\n'
}

function fenceAt(text: string, at: number): string {
  if (!isLineStart(text, at)) return ''
  if (text.startsWith(BACKTICK_FENCE, at)) return BACKTICK_FENCE
  if (text.startsWith(TILDE_FENCE, at)) return TILDE_FENCE
  return ''
}

function skipFence(text: string, at: number): number {
  const marker = fenceAt(text, at)
  if (!marker) return at
  let cursor = nextLine(text, at)
  while (cursor < text.length) {
    const end = lineEnd(text, cursor)
    if (text.slice(cursor, end).trim() === marker) return end < text.length ? end + 1 : end
    cursor = end < text.length ? end + 1 : end
  }
  return text.length
}

function matchingBrace(text: string, openAt: number): number {
  let depth = 0
  let cursor = openAt
  while (cursor < text.length) {
    const fenced = skipFence(text, cursor)
    if (fenced !== cursor) {
      cursor = fenced
      continue
    }
    if (text[cursor] === '{') depth += 1
    else if (text[cursor] === '}') {
      depth -= 1
      if (depth === 0) return cursor
    }
    cursor += 1
  }
  return -1
}

function stripQuotes(value: string): string {
  const text = value.trim()
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1).trim()
  }
  return text
}

function formatTemplateValue(value: TemplateValue, pad: string | undefined): string {
  const raw = String(value)
  if (!pad) return raw
  const width = Number(pad)
  if (!Number.isSafeInteger(width) || width < 1 || width > 12) return raw
  return raw.padStart(width, '0')
}

function substitute(text: string, vars: TemplateVars): string {
  return text.replace(VARIABLE_TOKEN, (whole, name: string, pad: string | undefined) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole
    return formatTemplateValue(vars[name] ?? '', pad)
  })
}

function parseRangeValues(
  args: string,
  collector: DiagnosticCollector,
  line: number,
  maxItems: number,
  emptyMessage?: string,
  strictIntegerSyntax = false,
): number[] | null {
  const parts = args.split(',').map((part) => part.trim())
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => part === '')) {
    collector.add(line, 'range 必须使用 range(stop)、range(start, stop) 或 range(start, stop, step)。')
    return null
  }

  if (strictIntegerSyntax && parts.some((part) => !/^[+-]?\d+$/u.test(part))) {
    collector.add(line, 'Codex 的 range 参数必须是十进制整数。')
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

function parseClosingLine(line: string): { braceCount: number; repeatCount: number | null } | null {
  const match = line.match(/^(\}+)(?:\*(\d+))?$/u)
  if (!match?.[1]) return null
  return { braceCount: match[1].length, repeatCount: match[2] === undefined ? null : Number(match[2]) }
}

function parseCloudDirective(
  line: string,
  config: CloudConfig,
  vars: TemplateVars,
  allowedTitleDirective: CloudLevel,
  collector: DiagnosticCollector,
  globalLineNumber: number,
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

  const variable = line.match(/^@var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/iu)
  if (variable) {
    if (allowedTitleDirective !== 'task') {
      collector.add(globalLineNumber, '@var 只能定义在 Task 层级。')
    } else {
      vars[variable[1] as string] = substitute(variable[2] ?? '', vars)
    }
    return true
  }

  return false
}

function parseCloudLevel(
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

    if (!seenBlock && parseCloudDirective(trimmed, config, vars, options.titleDirective, options.collector, currentLine)) {
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

function removeLeadingEventHeaders(body: string): { taskTitle: string; eventTitle: string; body: string } {
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

function queueUrlIsExecutable(value: string): boolean {
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

function startsWithStructuredQueueToken(value: string): boolean {
  const text = value.trimStart()
  if (!text) return false
  if (text.startsWith('{') || text.startsWith(BACKTICK_FENCE) || text.startsWith(TILDE_FENCE)) return true
  const closeAt = text.indexOf('>')
  return closeAt >= 0 && queueUrlIsExecutable(text.slice(0, closeAt + 1))
}

function queueFenceEnd(text: string, at: number, marker: string): { bodyStart: number; closeAt: number; next: number } | null {
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

function queueBlockHeader(line: string): 'act' | 'for' | null {
  if (/^@act\s*\{\s*$/iu.test(line)) return 'act'
  if (/^@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\(.*?\)\s*\{\s*$/iu.test(line)) return 'for'
  return null
}

function isQueueMetadataDirective(line: string): 'task' | 'event' | 'repeat' | 'start' | 'step' | null {
  const match = line.match(/^@(task|event|repeat|start|step)\s*=\s*(.*?)\s*$/iu)
  return (match?.[1]?.toLowerCase() as 'task' | 'event' | 'repeat' | 'start' | 'step' | undefined) ?? null
}

function addQueueError(options: QueueValidationOptions, detail: string): void {
  options.collector.add(options.line, `Event ${options.eventTitle || '未命名'} 队列${detail}。`)
}

function addQueueActCount(options: QueueValidationOptions, count: number): void {
  const budget = options.expansionBudget
  if (!budget || (options.depth ?? 0) > 0 || (options.pollDepth ?? 0) > 0 || count <= 0) return
  budget.acts += count
  const max = options.flavor === 'browser' ? WORKFLOW_DSL_LIMITS.maxBrowserTotalActs : WORKFLOW_DSL_LIMITS.maxCodexActs
  if (budget.acts > max) addQueueError(options, `展开后的 Act 数量不能超过 ${max}`)
}

function addCodexPromptCount(options: QueueValidationOptions, count: number): void {
  if (options.flavor !== 'codex' || !options.codexPromptBudget || count <= 0) return
  options.codexPromptBudget.prompts += count * (options.codexPromptMultiplier ?? 1)
  if (options.codexPromptBudget.prompts > WORKFLOW_DSL_LIMITS.maxCodexMessagesPerAct) {
    addQueueError(options, `单个 Codex Act 的消息数量不能超过 ${WORKFLOW_DSL_LIMITS.maxCodexMessagesPerAct}`)
  }
}

function leadingQueueRepeat(value: string): number | null {
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
    if (/^@(task|event|start|step|var)(?:\s|=)/iu.test(line)) continue
    break
  }
  return repeat
}

function validateQueueMetadata(
  kind: 'repeat' | 'start' | 'step',
  rawValue: string,
  options: QueueValidationOptions,
): void {
  if (options.flavor !== 'browser') return
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

function validateBrowserTemplateTokens(text: string, options: QueueValidationOptions): void {
  if (options.flavor !== 'browser') return
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
  }
  return { next: cursor, repeat: Number.isSafeInteger(repeat) && repeat > 0 ? repeat : 1 }
}

function validateQueueBody(value: string, options: QueueValidationOptions): boolean {
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
  const activeVariables = options.activeVariables ?? new Set<string>()
  const topLevel = depth === 0 && pollDepth === 0
  let topLevelLooseSeen = false
  let leadingRepeat = 1

  if (depth > WORKFLOW_DSL_LIMITS.maxNesting) {
    addQueueError(options, `执行块嵌套不能超过 ${WORKFLOW_DSL_LIMITS.maxNesting} 层`)
    return false
  }
  if (options.flavor === 'browser' && pollDepth > WORKFLOW_DSL_LIMITS.maxBrowserPollDepth) {
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
      if (options.flavor === 'browser' && currentPollDepth > WORKFLOW_DSL_LIMITS.maxBrowserPollDepth) {
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
      addCodexPromptCount(options, repeat.repeat)
      if (options.flavor === 'browser' && startsWithStructuredQueueToken(content)) {
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
      if (options.flavor === 'codex' && SELF_URL_TOKENS.has(line.toLowerCase())) {
        addQueueError(options, '中的 Codex URL 必须使用 HTTPS')
        return false
      }
      if (options.flavor === 'codex') addCodexPromptCount(options, 1)
      executable = true
      if (topLevel) topLevelLooseSeen = true
      leading = false
      cursor = end < text.length ? end + 1 : end
      continue
    }

    if (leading && /^@var\b/iu.test(line)) {
      addQueueError(options, '在 Event 内声明了 @var；变量只能定义在 Task 层级')
      return false
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
        const maxItems = options.flavor === 'browser'
          ? WORKFLOW_DSL_LIMITS.maxBrowserLoopItems
          : WORKFLOW_DSL_LIMITS.maxLoopItems
        const values = parseRangeValues(
          loop?.[2] ?? '',
          options.collector,
          options.line,
          maxItems,
          options.flavor === 'browser' ? '的 range 没有生成任何消息' : undefined,
          options.flavor === 'codex',
        )
        if (values === null) return false
        if (options.flavor === 'browser' && depth > 0) {
          addQueueError(options, '中的 @for 只能直接位于 Event 队列层级')
          return false
        }
        if (topLevel) {
          const repeat = options.flavor === 'browser' ? leadingQueueRepeat(text.slice(openAt + 1, closeAt)) ?? 1 : 1
          addQueueActCount(options, values.length * repeat)
        }
        const loopVariables = new Set(activeVariables)
        if (loop?.[1]) loopVariables.add(loop[1])
        loopVariables.add('index')
        loopVariables.add('count')
        const nestedPromptBudget = options.flavor === 'codex'
          ? topLevel ? { prompts: 0 } : options.codexPromptBudget
          : undefined
        const nestedPromptMultiplier = options.flavor === 'codex'
          ? topLevel ? (values.length > 0 ? 1 : 0) : (options.codexPromptMultiplier ?? 1) * values.length
          : undefined
        const nested = validateQueueBody(text.slice(openAt + 1, closeAt), {
          ...options,
          activeVariables: loopVariables,
          depth: depth + 1,
          codexPromptBudget: nestedPromptBudget,
          codexPromptMultiplier: nestedPromptMultiplier,
        })
        if (nested && values.length > 0) executable = true
      } else {
        if (topLevel) {
          const bodyRepeat = leadingQueueRepeat(text.slice(openAt + 1, closeAt))
          const repeat = options.flavor === 'browser'
            ? bodyRepeat ?? leadingRepeat
            : 1
          addQueueActCount(options, repeat)
        }
        const nestedPromptBudget = options.flavor === 'codex' ? { prompts: 0 } : undefined
        const nested = validateQueueBody(text.slice(openAt + 1, closeAt), {
          ...options,
          depth: depth + 1,
          codexPromptBudget: nestedPromptBudget,
          codexPromptMultiplier: 1,
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

function validateEvent(
  block: CloudBlock,
  index: number,
  taskTitle: string,
  flavor: QueueFlavor,
  collector: DiagnosticCollector,
): void {
  const extracted = removeLeadingEventHeaders(block.body)
  const eventTitle = block.title.trim() || extracted.eventTitle || `Event ${index + 1}`
  const resolvedTaskTitle = taskTitle.trim() || extracted.taskTitle || 'Cloud task'
  const body = extracted.body

  if (!body) {
    collector.add(block.line, `Event ${eventTitle} 没有可执行的队列正文。`)
    return
  }

  const queueText = [`@task=${resolvedTaskTitle}`, `@event=${eventTitle}`, body].join('\n')
  if (UTF8_ENCODER.encode(queueText).byteLength > WORKFLOW_DSL_LIMITS.maxEventQueueBytes) {
    collector.add(block.line, 'Event 队列不能超过 768 KiB。')
  }

  if (flavor === 'browser') {
    validateBrowserTemplateTokens(eventTitle, {
      flavor,
      eventTitle,
      line: block.line,
      collector,
      activeVariables: new Set<string>(),
    })
  }

  validateQueueBody(body, {
    flavor,
    eventTitle,
    line: block.line,
    collector,
    activeVariables: new Set<string>(),
    expansionBudget: { acts: 0 },
    codexPromptBudget: flavor === 'codex' ? { prompts: 0 } : undefined,
    codexPromptMultiplier: 1,
  })
}

/**
 * Validate the same source in the same order as cloud orchestration: Run -> Task -> Event queue,
 * then apply the browser/Codex parser restrictions to the generated Event queue.
 */
export function validateWorkflowSource(source: string): WorkflowDiagnostic[] {
  const normalized = normalizeNewlines(source)
  const trimmed = normalized.trim()
  const collector = new DiagnosticCollector(source)

  if (!trimmed) {
    collector.add(1, '工作流定义不能为空。')
    return collector.items
  }

  if (UTF8_ENCODER.encode(trimmed).byteLength > WORKFLOW_DSL_LIMITS.maxPlanBytes) {
    collector.add(1, '工作流定义不能超过 2 MiB。')
    return collector.items
  }

  const run = parseCloudLevel(normalized, {
    level: 'run',
    titleDirective: 'run',
    blockKinds: ['task', 'codex'],
    lineBase: 0,
    depth: 0,
    budget: { expandedBytes: 0, iterations: 0 },
    collector,
  })

  if (!run.failed && run.blocks.length === 0) {
    collector.add(1, 'Run 至少需要一个 @task 或 @Codex 块。')
  }
  if (run.blocks.length > WORKFLOW_DSL_LIMITS.maxRunTasks) {
    collector.add(run.blocks[WORKFLOW_DSL_LIMITS.maxRunTasks]?.line ?? 1, 'Run 最多只能生成 256 个 Task。')
  }

  run.blocks.slice(0, WORKFLOW_DSL_LIMITS.maxRunTasks + 1).forEach((runBlock, index) => {
    const defaultTitle = runBlock.title.trim() || `Task ${index + 1}`
    const task = parseCloudLevel(runBlock.body, {
      level: 'task',
      titleDirective: 'task',
      blockKinds: ['event'],
      inheritedVars: run.vars,
      lineBase: runBlock.line - 1,
      depth: 0,
      budget: { expandedBytes: 0, iterations: 0 },
      collector,
      defaultTitle,
    })
    const taskTitle = task.config.title.trim() || 'Cloud task'

    if (!task.failed && task.blocks.length === 0) {
      collector.add(runBlock.line, 'Task 至少需要生成一个 @event 块。')
    }
    if (task.blocks.length > WORKFLOW_DSL_LIMITS.maxTaskEvents) {
      collector.add(task.blocks[WORKFLOW_DSL_LIMITS.maxTaskEvents]?.line ?? runBlock.line, 'Task 最多只能生成 1000 个 Event。')
    }

    task.blocks.slice(0, WORKFLOW_DSL_LIMITS.maxTaskEvents + 1).forEach((eventBlock, eventIndex) => {
      validateEvent(
        eventBlock,
        eventIndex,
        taskTitle,
        runBlock.kind === 'codex' ? 'codex' : 'browser',
        collector,
      )
    })
  })

  return collector.items
}

export function readRunPlanMeta(source: string): PlanMeta {
  const normalized = normalizeNewlines(source)
  let title = 'Cloud run'
  let mode: DispatchExecutionMode = 'serial'
  let maxConcurrency = 1
  let seenBlock = false

  for (const raw of normalized.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    if (!seenBlock) {
      const titleMatch = line.match(/^@run\s*=\s*(.*?)\s*$/iu)
      if (titleMatch) {
        title = stripQuotes(titleMatch[1] ?? '') || 'Cloud run'
        continue
      }
      const modeMatch = line.match(/^@mode\s*=\s*(serial|parallel)\s*$/iu)
      if (modeMatch) {
        mode = modeMatch[1]?.toLowerCase() as DispatchExecutionMode
        continue
      }
      const concurrencyMatch = line.match(/^@maxConcurrency\s*=\s*(\d+)\s*$/iu)
      if (concurrencyMatch) {
        const parsed = Number(concurrencyMatch[1])
        if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 16) maxConcurrency = parsed
        continue
      }
      if (/^@(task|codex)(?:\s+.*?)?\s*\{\s*$/iu.test(line) || /^@for\s+.*\{\s*$/iu.test(line)) {
        seenBlock = true
      }
    }
  }

  return {
    title: title.trim() || 'Cloud run',
    mode,
    maxConcurrency: mode === 'serial' ? 1 : Math.max(1, Math.min(16, Math.floor(maxConcurrency))),
  }
}

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

    if (/^@(task|codex)(?:\s+.*?)?\s*\{\s*$/iu.test(line)) {
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

interface VariableScope {
  kind: 'run' | 'task' | 'event' | 'act' | 'message' | 'for-task' | 'for-event' | 'for-queue'
  variables: Set<string>
}

function variableContext(frames: VariableScope[]): WorkflowDslContext {
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
    if (variable?.[1] && context === 'task') frames.at(-1)?.variables.add(variable[1])

    const loop = line.match(/^@for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\([^)]*\)\s*\{/iu)
    if (loop?.[1]) {
      frames.push({
        kind: context === 'run' ? 'for-task' : context === 'task' ? 'for-event' : 'for-queue',
        variables: new Set([loop[1], 'index', 'count']),
      })
      continue
    }
    if (/^@(task|codex)(?:\s+.*?)?\s*\{\s*$/iu.test(line)) {
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
