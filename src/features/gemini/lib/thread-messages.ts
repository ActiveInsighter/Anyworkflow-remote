import type { ThreadMessageLike } from '@assistant-ui/react'
import type { GeminiJob, GeminiMessage } from '@/types/gemini'

/** PocketBase remains authoritative; the UI never executes persisted tool calls. */
export function toThreadMessages(job: GeminiJob, message: GeminiMessage): ThreadMessageLike[] {
  const history: ThreadMessageLike[] = (job.history ?? []).map((turn, index) => ({
    id: `${job.id}-history-${index}`, role: turn.role === 'model' ? 'assistant' : 'user', content: turn.text,
  }))
  const content: Exclude<ThreadMessageLike['content'], string>[number][] = []
  for (const part of message.response?.parts ?? []) {
    if (part.type !== 'text') content.push({ type: 'data-gemini-activity', id: part.id, data: part })
  }
  if (message.reply) content.push({ type: 'text', text: message.reply })
  else content.push({ type: 'text', text: message.status === 'queued' ? '等待发送…' : message.status === 'running' ? '正在生成完整回复…' : message.status === 'canceled' ? '消息已取消。' : '没有收到回复。' })
  content.push({ type: 'data-gemini-info', data: { message, title: job.title } })
  return [...history, {
    id: `${message.id}-question`, role: 'user',
    content: [job.prompt, message.inputText].filter(Boolean).join('\n\n'),
  }, {
    id: message.id, role: 'assistant', content,
    status: ['queued', 'running'].includes(message.status) ? { type: 'running' } :
      { type: 'complete', reason: 'stop' },
  }]
}
