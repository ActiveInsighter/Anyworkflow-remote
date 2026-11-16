import type { ThreadMessageLike } from '@assistant-ui/react'
import type { GeminiJob, GeminiMessage, GeminiResponsePart } from '@/types/gemini'

type MessagePart = Exclude<ThreadMessageLike['content'], string>[number]
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
function assistantContent(message: GeminiMessage): MessagePart[] {
  const parts = message.response?.parts ?? [], consumed = new Set<string>(), content: MessagePart[] = []
  const partners = new Map<string, GeminiResponsePart>()
  for (const call of parts) {
    if (call.type !== 'tool-call' || !call.callId) continue
    const result = parts.find(item => item.type === 'tool-result' && item.callId === call.callId && !consumed.has(item.id))
    if (result) { consumed.add(result.id); partners.set(call.id,result) }
  }
  let displayedReply = false
  for (const part of parts) {
    if (consumed.has(part.id)) continue
    if (part.type === 'text') {
      for (const part of parts) if ((part.type === 'tool-result' && !consumed.has(part.id)) || part.type === 'artifact') {
    content.push({type:'data',name:'gemini-response',data:part})
  }
  if (!displayedReply && message.reply) { content.push({ type: 'text', text: message.reply }); displayedReply = true }
    } else if (part.type === 'reasoning') {
      if (part.text) content.push({ type: 'reasoning', text: part.text })
    } else if (part.type === 'tool-call') {
      const result = partners.get(part.id)
      const raw = object(part.data), args = object(raw.args ?? raw.arguments ?? raw) as Extract<MessagePart, { type: 'tool-call' }>['args']
      content.push({ type: 'tool-call', toolCallId: part.callId || part.id, toolName: part.name || part.providerType || 'tool', args, argsText: JSON.stringify(args),
        ...(result ? { result: result.data, isError: object(result.data).is_error === true } : {}) })
    } else if (part.type === 'tool-result' || part.type === 'artifact') {
      content.push({type:'data',name:'gemini-response',data:part})
    }
  }
  if (!displayedReply && message.reply) content.push({ type: 'text', text: message.reply })
  // No partial tokens: the original demo's indicator represents waiting for a complete result.
  if (!content.length && ['queued', 'running'].includes(message.status)) content.push({ type: 'text', text: '' })
  const citations = message.response?.metadata.citations
  if (Array.isArray(citations)) for (const [index, citation] of citations.entries()) {
    const source = object(citation), url = source.uri ?? source.url
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) content.push({type:'source', sourceType:'url', id:`${message.id}-source-${index}`, url,
      ...(typeof source.title === 'string' ? {title:source.title} : {})})
  }
  return content
}
function assistantMessage(message: GeminiMessage): ThreadMessageLike {
  const pending = ['queued','running'].includes(message.status)
  const start = Date.parse(message.startedAt || ''), end = Date.parse(message.finishedAt || '')
  return { id:message.id, role:'assistant', content:assistantContent(message),
    status:pending ? {type:'running'} : message.error ? {type:'incomplete',reason:'error',error:message.error} : message.status==='canceled' ? {type:'incomplete',reason:'cancelled'} : {type:'complete',reason:'stop'},
    metadata: {custom:{geminiJob:message.job},
      ...(message.feedback ? {submittedFeedback:{type:message.feedback,comment:message.feedbackComment}} : {}),
      ...(Number.isFinite(start) && Number.isFinite(end) && end>=start ? {timing:{streamStartTime:start,totalStreamTime:end-start,totalChunks:0,toolCallCount:message.response?.parts.filter(p=>p.type==='tool-call').length ?? 0}} : {})}}
}
function question(id: string, text: string, attachment?: {id:string;name:string}): ThreadMessageLike {
  return {id:`${id}-question`,role:'user',content:text, ...(attachment ? {attachments:[{...attachment,type:'document',contentType:'text/markdown',status:{type:'complete'},content:[]}]} : {})}
}
export function toThreadMessages(job: GeminiJob, message: GeminiMessage, ancestors: GeminiMessage[] = []): ThreadMessageLike[] {
  const turns = job.history ?? [], history: ThreadMessageLike[] = []
  for (let index=0;index<turns.length;index+=2) {
    const prior = ancestors[Math.floor(turns.length/2)-1-Math.floor(index/2)]
    let text = turns[index].text
    const file = prior?.sourceId?.endsWith('.md') ? {id:prior.sourceId,name:prior.sourceName} : undefined
    if (file && prior?.inputText && text.endsWith(prior.inputText)) text=text.slice(0,-prior.inputText.length).trimEnd()
    history.push(question(prior?.id || `${job.id}-history-${index}`,text,file))
    if (prior) history.push(assistantMessage(prior))
    else if (turns[index+1]) history.push({id:`${job.id}-history-${index+1}`,role:'assistant',content:turns[index+1].text})
  }
  const file = job.sources.find(source=>source.id===message.sourceId || source.name===message.sourceName)
  return [...history,question(message.id,file ? job.prompt : [job.prompt,message.inputText].filter(Boolean).join('\n\n'),file),assistantMessage(message)]
}
