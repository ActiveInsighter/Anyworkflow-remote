export interface EventActStructure {
  id: string
  title: string
  messageCount: number
}

export interface EventActProgress extends EventActStructure {
  completedMessages: number
  percent: number
  state: 'pending' | 'running' | 'completed'
}

export interface EventProgressStructure {
  acts: EventActProgress[]
  completedActs: number
  totalActs: number
  percent: number
  completedMessages: number
  totalMessages: number
}

function normalize(source: string): string {
  return source.replace(/\r\n?/gu, '\n')
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
  let cursor = at - 1
  while (cursor >= 0 && (text[cursor] === ' ' || text[cursor] === '\t')) cursor -= 1
  return cursor < 0 || text[cursor] === '\n'
}

function fenceAt(text: string, at: number): string {
  if (!isLineStart(text, at)) return ''
  if (text.startsWith('```', at)) return '```'
  if (text.startsWith('~~~', at)) return '~~~'
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
  for (let cursor = openAt; cursor < text.length; cursor += 1) {
    const fenceNext = skipFence(text, cursor)
    if (fenceNext !== cursor) {
      cursor = fenceNext - 1
      continue
    }
    if (text[cursor] === '{') depth += 1
    else if (text[cursor] === '}') {
      depth -= 1
      if (depth === 0) return cursor
    }
  }
  return -1
}

function repeatAfter(text: string, at: number): number {
  const match = text.slice(at).match(/^\s*\*(\d+)/u)
  if (!match) return 1
  const value = Number(match[1])
  return Number.isSafeInteger(value) && value > 0 ? value : 1
}

function looksStructured(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('<') || trimmed.startsWith('```') || trimmed.startsWith('~~~')
}

function countMessages(source: string): number {
  const text = normalize(source)
  let total = 0
  let cursor = 0

  while (cursor < text.length) {
    while (cursor < text.length && /\s/u.test(text[cursor] ?? '')) cursor += 1
    if (cursor >= text.length) break

    const marker = fenceAt(text, cursor)
    if (marker) {
      const end = skipFence(text, cursor)
      const body = text.slice(nextLine(text, cursor), Math.max(nextLine(text, cursor), end - marker.length - 1)).trim()
      if (body) total += 1
      cursor = end
      continue
    }

    if (text[cursor] === '<') {
      const end = text.indexOf('>', cursor + 1)
      if (end >= 0) {
        const token = text.slice(cursor + 1, end).trim()
        if (/^(?:https:\/\/|self$|current$|here$|本页$|当前页$|当前页面$)/iu.test(token)) total += 1
        cursor = end + 1
        continue
      }
    }

    if (text[cursor] === '{') {
      const close = matchingBrace(text, cursor)
      const end = close >= 0 ? close : text.length
      const inner = text.slice(cursor + 1, end).trim()
      const base = inner ? (looksStructured(inner) ? countMessages(inner) : 1) : 0
      total += base * repeatAfter(text, end + 1)
      cursor = end + 1
      const repeat = text.slice(cursor).match(/^\s*\*\d+/u)?.[0] ?? ''
      cursor += repeat.length
      continue
    }

    const end = lineEnd(text, cursor)
    const line = text.slice(cursor, end).trim()
    if (!/^@(?:task|event|action|repeat|start|step|var)\b/iu.test(line) && line) {
      // Unwrapped text is invalid in the executor, so it must not inflate progress.
    }
    cursor = end < text.length ? end + 1 : end
  }

  return total
}

function actionTitle(body: string, fallback: string): string {
  const match = body.match(/^\s*@action\s*=\s*(.*?)\s*$/imu)
  return match?.[1]?.trim() || fallback
}

function rangeCount(header: string): number {
  const match = header.match(/range\((.*?)\)/iu)
  if (!match) return 1
  const parts = match[1].split(',').map((item) => Number(item.trim()))
  if (parts.some((value) => !Number.isSafeInteger(value))) return 1
  const start = parts.length === 1 ? 0 : parts[0]
  const stop = parts.length === 1 ? parts[0] : parts[1]
  const step = parts.length === 3 ? parts[2] : 1
  if (!step) return 1
  const distance = step > 0 ? stop - start : start - stop
  return distance < 0 ? 0 : Math.max(0, Math.floor(distance / Math.abs(step)) + 1)
}

export function parseEventActs(queueText: string): EventActStructure[] {
  const text = normalize(queueText)
  const acts: EventActStructure[] = []
  const consumed: Array<[number, number]> = []
  let cursor = 0

  while (cursor < text.length) {
    const end = lineEnd(text, cursor)
    const rawLine = text.slice(cursor, end)
    const line = rawLine.trim()
    const act = line.match(/^@act\s*\{\s*$/iu)
    const loop = line.match(/^@for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\(.*?\)\s*\{\s*$/iu)

    if (!act && !loop) {
      cursor = end < text.length ? end + 1 : end
      continue
    }

    const openAt = cursor + rawLine.indexOf('{')
    const closeAt = matchingBrace(text, openAt)
    const bodyEnd = closeAt >= 0 ? closeAt : text.length
    const body = text.slice(openAt + 1, bodyEnd)
    consumed.push([cursor, bodyEnd + 1])

    const count = countMessages(body)
    const instances = loop ? Math.max(1, rangeCount(line)) : 1
    for (let index = 0; index < instances; index += 1) {
      const number = acts.length + 1
      acts.push({
        id: `act-${number}`,
        title: actionTitle(body, `Act ${number}`),
        messageCount: count,
      })
    }
    cursor = bodyEnd + 1
  }

  if (!acts.length) {
    const messageCount = countMessages(text)
    return messageCount ? [{ id: 'act-1', title: 'Act 1', messageCount }] : []
  }

  const loose = consumed.reduce((value, [from, to]) => value.slice(0, from) + ' '.repeat(to - from) + value.slice(to), text)
  const looseMessages = countMessages(loose)
  if (looseMessages > 0) {
    acts.unshift({ id: 'act-0', title: 'Act 1', messageCount: looseMessages })
    return acts.map((act, index) => ({ ...act, id: `act-${index + 1}`, title: act.title.replace(/^Act \d+$/u, `Act ${index + 1}`) }))
  }

  return acts
}

function progressNumber(progress: Record<string, unknown> | null, key: 'index' | 'total'): number | null {
  const value = progress?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

export function deriveEventProgress(
  queueText: string,
  progress: Record<string, unknown> | null,
  terminalResult: string,
): EventProgressStructure {
  const parsedActs = parseEventActs(queueText)
  const parsedTotal = parsedActs.reduce((sum, act) => sum + act.messageCount, 0)
  const runtimeTotal = progressNumber(progress, 'total')
  const totalMessages = runtimeTotal && runtimeTotal > 0 ? runtimeTotal : parsedTotal
  const completedRaw = terminalResult === 'succeeded'
    ? totalMessages
    : progressNumber(progress, 'index') ?? 0
  const completedMessages = Math.max(0, Math.min(totalMessages, completedRaw))

  let cursor = 0
  const acts = parsedActs.map((act) => {
    const completed = Math.max(0, Math.min(act.messageCount, completedMessages - cursor))
    cursor += act.messageCount
    const percent = act.messageCount > 0 ? Math.round((completed / act.messageCount) * 100) : terminalResult === 'succeeded' ? 100 : 0
    return {
      ...act,
      completedMessages: completed,
      percent,
      state: (percent >= 100 ? 'completed' : completed > 0 ? 'running' : 'pending') as EventActProgress['state'],
    }
  })

  if (!acts.length && totalMessages > 0) {
    const percent = totalMessages ? Math.round((completedMessages / totalMessages) * 100) : 0
    acts.push({
      id: 'act-1',
      title: 'Act 1',
      messageCount: totalMessages,
      completedMessages,
      percent,
      state: percent >= 100 ? 'completed' : completedMessages > 0 ? 'running' : 'pending',
    })
  }

  const completedActs = terminalResult === 'succeeded'
    ? acts.length
    : acts.filter((act) => act.state === 'completed').length
  const totalActs = acts.length
  return {
    acts,
    completedActs,
    totalActs,
    percent: totalActs > 0 ? Math.round((completedActs / totalActs) * 100) : 0,
    completedMessages,
    totalMessages,
  }
}
