import type { ThreadMessageLike } from '@assistant-ui/react'
import type { GeminiJob, GeminiMessage } from '@/types/gemini'

type MessagePart = Exclude<ThreadMessageLike['content'], string>[number]
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Convert persisted provider records to the native types consumed by upstream UI. */
function assistantContent(message: GeminiMessage): MessagePart[] {
  const parts = message.response?.parts ?? []
  const consumed = new Set<string>()
  const content: MessagePart[] = []
  let displayedReply = false
  for (const part of parts) {
    if (consumed.has(part.id)) continue
    if (part.type === 'text') {
      if (!displayedReply && message.reply) { content.push({ type: 'text', text: message.reply }); displayedReply = true }
    } else if (part.type === 'reasoning') {
      if (part.text) content.push({ type: 'reasoning', text: part.text })
    } else if (part.type === 'tool-call') {
      const result = part.callId ? parts.find(item => item.type === 'tool-result' && item.callId === part.callId && !consumed.has(item.id)) : undefined
      if (result) consumed.add(result.id)
      const raw = object(part.data)
      const args = object(raw.args ?? raw.arguments ?? raw) as Extract<MessagePart, { type: 'tool-call' }>['args']
      content.push({ type: 'tool-call', toolCallId: part.callId || part.id, toolName: part.name || part.providerType || 'tool',
        args, argsText: JSON.stringify(args), ...(result ? { result: result.data, isError: object(result.data).is_error === true } : {}) })
    } else {
      // Non-text artifacts and unmatched results are retained in Response details.
    }
  }
  if (!displayedReply && message.reply) content.push({ type: 'text', text: message.reply })
  const pending = ['queued', 'running'].includes(message.status)
  if (!content.length && pending) content.push({ type: 'text', text: message.status === 'queued' ? 'Waiting to start…' : 'Waiting for the complete response…' })
  return content
}
/** Older saved turns keep their native tool and reasoning UI after a follow-up. */
export function toThreadMessages(job: GeminiJob, message: GeminiMessage, ancestors: GeminiMessage[] = []): ThreadMessageLike[] {
  const turns = job.history ?? []
  const history: ThreadMessageLike[] = turns.map((turn, index) => {
    const prior = turn.role === 'model' ? ancestors[Math.floor(turns.length / 2) - 1 - Math.floor(index / 2)] : undefined
    return { id: prior?.id || `${job.id}-history-${index}`, role: turn.role === 'model' ? 'assistant' : 'user',
      content: prior ? assistantContent(prior) : turn.text }
  })
  const content = assistantContent(message)
  const pending = ['queued', 'running'].includes(message.status)
  return [...history, { id: `${message.id}-question`, role: 'user', content: [job.prompt, message.inputText].filter(Boolean).join('\n\n') }, {
    id: message.id, role: 'assistant', content,
    status: pending ? { type: 'running' } : message.error ? { type: 'incomplete', reason: 'error', error: message.error } :
      message.status === 'canceled' ? { type: 'incomplete', reason: 'cancelled' } : { type: 'complete', reason: 'stop' },
  }]
}
