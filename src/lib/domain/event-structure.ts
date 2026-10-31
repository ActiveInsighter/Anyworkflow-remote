import { DiagnosticCollector } from '../workflow-dsl/diagnostics.ts'
import { removeLeadingEventHeaders } from '../workflow-dsl/cloud-parser.ts'
import { queueNodeCount, walkEventQueue } from '../workflow-dsl/queue-validator.ts'

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

/**
 * The Acts of a stored Event queue, in run order, with the executor nodes each one sends. The
 * same walk as the editor's validator, so loops (lists, tuples, dependent ranges) count exactly
 * as the browser expands them. Acts without their own `@event=` are numbered.
 */
export function parseEventActs(queueText: string): EventActStructure[] {
  const { body } = removeLeadingEventHeaders(queueText)
  if (!body) return []
  const walked = walkEventQueue(body, {
    eventTitle: '',
    line: 1,
    collector: new DiagnosticCollector(body),
    activeVariables: new Set<string>(),
  })
  if (!walked.acts.length) {
    const nodes = queueNodeCount(body)
    return nodes ? [{ id: 'act-1', title: 'Act 1', messageCount: nodes }] : []
  }
  return walked.acts.map((act, index) => ({
    id: `act-${index + 1}`,
    title: act.title || `Act ${index + 1}`,
    messageCount: act.nodes,
  }))
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
