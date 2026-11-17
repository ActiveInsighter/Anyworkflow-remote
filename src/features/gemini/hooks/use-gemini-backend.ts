import { useAgentParts } from './use-agent-parts'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useExternalStoreRuntime, MessageNotSentError, WebSpeechDictationAdapter, WebSpeechSynthesisAdapter, type AppendMessage, type AssistantRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import { useAsyncData } from '@/hooks/use-async-data'
import { cancelGemini, createGemini, deleteGeminiThread, getGeminiAncestors, getGeminiConfig, getGeminiMessage, getGeminiView, listGeminiThreads, submitGeminiFeedback, updateGeminiThread } from '@/lib/api/gemini'
import { newRecordId } from '@/lib/api/file-conversion'
import { wakeConverter } from '@/lib/api/converter-dispatcher'
import { geminiTextKind, notifyTasksChanged } from '@/lib/tasks'
import { toErrorMessage } from '@/lib/api/errors'
import type { GeminiInput } from '@/types/gemini'
import { toThreadMessages } from '../lib/thread-messages'
import { inputSources, markdownAttachmentAdapter } from '../lib/markdown-attachments'

const speechAdapters = {
  ...(typeof window !== 'undefined' && 'speechSynthesis' in window ? { speech: new WebSpeechSynthesisAdapter() } : {}),
  ...(WebSpeechDictationAdapter.isSupported() ? { dictation: new WebSpeechDictationAdapter({ continuous: true }) } : {}),
  // The homepage's feedback integration persists before marking the native UI submitted.
  feedback: { submit() {} },
}
export function useGeminiBackend() {
  const [params, setParams] = useSearchParams(), id = params.get('job')
  const [selected, setSelected] = useState(''), [model, setModel] = useState(''), [effort, setEffort] = useState<string | undefined>()
  const [error, setError] = useState(''), [sending, setSending] = useState(false)
  const [optimistic, setOptimistic] = useState<ThreadMessageLike[] | null>(null)
  const locked = useRef(false), cancelIntent = useRef(false), navigation = useRef(0)
  const runtimeRef = useRef<AssistantRuntime | null>(null)
  const submission = useRef<{ key: string; id: string } | null>(null)
  const config = useAsyncData(getGeminiConfig, [])
  const catalog = useAsyncData(listGeminiThreads, [], { pollMs: data => data?.some(job => geminiTextKind.isActive(job.status)) ? 5000 : 30000 })
  const view = useAsyncData(signal => id ? getGeminiView(id, signal) : Promise.resolve(null), [id], {
    cacheKey: id ? `official-gemini-view:${id}` : undefined, pollMs: data => data && geminiTextKind.isActive(data.job.status) ? 3000 : 30000,
  })
  const job = view.data?.job.id === id ? view.data.job : null
  const segment = job ? view.data?.messages.find(item => item.id === selected) ?? view.data?.messages[0] : undefined
  const detail = useAsyncData(signal => id && segment ? getGeminiMessage(id, segment.id, signal) : Promise.resolve(null),
    [id, segment?.id, segment?.status, ['queued', 'running'].includes(segment?.status ?? '') ? '' : segment?.updated], { cacheKey: id && segment ? `official-gemini-message:${id}:${segment.id}` : undefined,
      pollMs: 30000 })
  const record = detail.data?.id === segment?.id && detail.data?.job === id ? detail.data : null
  const progress = useAgentParts(id || '', segment?.id || '', Boolean(record && record.streamRevision != null), segment?.status || '')
  const message = useMemo(() => record && progress.data ? { ...record, agentParts: progress.data.items,
    progressAt: progress.data.progressAt, usage: { ...record.usage, ...progress.data.usage } } : record, [record, progress.data])
  const ancestors = useAsyncData(async signal => ({ jobId: id, messages: job && catalog.data ? await getGeminiAncestors(job, catalog.data, signal) : [] }),
    [id, job?.parentMessage, Boolean(catalog.data)], { enabled: Boolean(job && catalog.data), cacheKey: id ? `official-gemini-ancestors:${id}` : undefined })
  const priorMessages = ancestors.data?.jobId === id ? ancestors.data.messages : []
  const historyReady = !job?.parentMessage || ancestors.data?.jobId === id
  const pending = Boolean(job && geminiTextKind.isActive(job.status))
  const effectiveModel = model || job?.model || config.data?.config.model || 'gemini-3.5-flash-lite'
  const effectiveEffort = effort ?? job?.options.thinkingLevel ?? config.data?.config.thinkingLevel ?? ''
  const persisted = useMemo(() => job && message && historyReady ? toThreadMessages(job, message, ancestors.data?.jobId === id ? ancestors.data.messages : []) : [], [id, job, message, ancestors.data, historyReady])
  const messages = optimistic ?? persisted
  const open = useCallback((nextId: string | null) => {
    navigation.current++; setError(''); setSelected(''); setModel(''); setEffort(undefined); setOptimistic(null); submission.current = null
    setParams(current => { const next = new URLSearchParams(current); if (nextId) next.set('job', nextId); else next.delete('job'); return next }, { replace: true })
  }, [setParams])
  type Draft = Pick<AppendMessage, 'content' | 'attachments'> & {metadata?: AppendMessage['metadata']}
  const submit = useCallback(async (input: Draft, replace?: { id: string; index: number }) => {
    if (locked.current || pending) throw new MessageNotSentError('请等待当前回复结束')
    locked.current = true; cancelIntent.current = false; setSending(true); setError('')
    const origin = navigation.current
    let accepted = false
    try {
      if (!config.data) throw new Error('请等待消息配置加载完成')
      const target = replace ? [message, ...priorMessages].find(record => record?.id === replace.id) : undefined
      if (replace && !target) throw new Error('请等待对话历史加载完成')
      let prompt = input.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
      const quote = input.metadata?.custom?.quote
      if (quote && typeof quote === 'object' && 'text' in quote && typeof quote.text === 'string') prompt = `> ${quote.text.replaceAll('\n','\n> ')}\n\n${prompt}`
      const context = runtimeRef.current?.thread.getModelContext().system
      let systemPrompt = [config.data.config.systemPrompt,context].filter(Boolean).join('\n\n')
      if (systemPrompt.length > 12000) {
        if (prompt.includes(':command[')) throw new Error('使用快捷命令时，请先缩短系统提示词，为命令说明留出空间')
        systemPrompt = config.data.config.systemPrompt
      }
      let sources = inputSources(input as AppendMessage)
      if (replace && !sources.length && target?.sourceId?.endsWith('.md')) sources = [{id:target.sourceId,name:target.sourceName,content:target.inputText}]
      const payload: GeminiInput = { ...config.data.config, responseVersion:1, title:'', text:replace && !sources.length ? target?.inputText || '' : '', prompt,
        systemPrompt, sources, model:effectiveModel, thinkingLevel:effectiveEffort,
        ...(replace ? {replacesMessage:replace.id} : message?.reply && !pending ? {parentMessage:message.id} : {}) }
      const key = JSON.stringify(payload)
      if (submission.current?.key !== key) submission.current = { key, id:newRecordId() }
      const outgoingId = submission.current.id
      setOptimistic([...(replace ? persisted.slice(0,replace.index) : persisted), {id:`${outgoingId}-draft`,role:'user',content:input.content,attachments:input.attachments},
        {id:outgoingId,role:'assistant',content:[{type:'text',text:''}],status:{type:'running'}}])
      const created = await createGemini(outgoingId,payload)
      accepted = true; submission.current = null
      if (cancelIntent.current) {
        try { await cancelGemini(created) } catch(cause) { setError(toErrorMessage(cause)) }
      }
      wakeConverter(); notifyTasksChanged(); await catalog.reload()
      if (navigation.current === origin) open(created.id)
    } catch(cause) {
      if (navigation.current === origin) setError(toErrorMessage(cause))
      if (!accepted) throw new MessageNotSentError(toErrorMessage(cause))
    } finally { locked.current=false; setSending(false); setOptimistic(null) }
  }, [config.data,effectiveModel,effectiveEffort,message,priorMessages,pending,persisted,catalog.reload,open])
  const operation = useCallback(async (action: () => Promise<unknown>, refreshView = true) => {
    setError('')
    try { await action(); await catalog.reload(); if (refreshView) await view.reload() }
    catch(cause) {setError(toErrorMessage(cause)); throw cause}
  }, [catalog.reload,view.reload])
  const families = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof catalog.data>[number]>()
    for (const row of catalog.data ?? []) {const root=row.threadRoot || row.id;if(!latest.has(root)) latest.set(root,row)}
    return latest
  },[catalog.data])
  const threadRoot = job?.threadRoot || catalog.data?.find(row=>row.id===id)?.threadRoot || id || undefined
  const threadList = useMemo(() => ({
    threadId:threadRoot,isLoading:catalog.loading,
    threads:[...families].filter(([,row])=>!row.archived).map(([root,row])=>({id:root,title:row.title,status:'regular' as const,lastMessageAt:new Date(row.created),custom:{...(row.pinned ? {pinned:'true'} : {})}})),
    archivedThreads:[...families].filter(([,row])=>row.archived).map(([root,row])=>({id:root,title:row.title,status:'archived' as const})),
    onSwitchToNewThread:()=>open(null),onSwitchToThread:(value:string)=>open(families.get(value)?.id || value),
    onRename:(value:string,title:string)=>operation(()=>updateGeminiThread(families.get(value)?.id || value,{title})),
    onUpdateCustom:(value:string,custom:Record<string,unknown> | undefined)=>operation(()=>updateGeminiThread(families.get(value)?.id || value,{pinned:custom?.pinned==='true'})),
    onArchive:(value:string)=>operation(()=>updateGeminiThread(families.get(value)?.id || value,{archived:true})),
    onUnarchive:(value:string)=>operation(()=>updateGeminiThread(families.get(value)?.id || value,{archived:false})),
    onDelete:(value:string)=>operation(async()=>{await deleteGeminiThread(families.get(value)?.id || value);notifyTasksChanged();if(value===threadRoot)open(null)},false),
  }),[threadRoot,families,catalog.loading,open,operation])
  const reload = useCallback(async(parentId:string | null)=>{
    const index=persisted.findIndex(item=>item.id===parentId && item.role==='user'), question=persisted[index], response=persisted[index+1]
    if(index<0 || !question || response?.role!=='assistant' || !response.id) throw new MessageNotSentError('请等待对话历史加载完成')
    const content=typeof question.content==='string' ? [{type:'text' as const,text:question.content}] : question.content.filter(part=>part.type==='text')
    await submit({content,attachments:question.attachments as AppendMessage['attachments']},{id:response.id,index})
  },[persisted,submit])
  const runtime = useExternalStoreRuntime({messages,convertMessage:value=>value,
    onNew:input=>submit(input),
    onEdit:input=>{const index=persisted.findIndex(item=>item.id===input.sourceId),response=persisted[index+1];if(index<0 || !response?.id)throw new MessageNotSentError('请等待对话历史加载完成');return submit(input,{id:response.id,index})},
    onReload:reload,onRefetchThread:async()=>{await view.reload();await detail.reload();await progress.reload();await ancestors.reload()},
    isRunning:pending || sending,isLoading:Boolean(id && (!job || !message || !historyReady) && (view.loading || detail.loading || ancestors.loading)),
    isSendDisabled:sending || pending || !config.data || Boolean(id && (!job || !historyReady || !message?.reply)),
    onCancel:async()=>{if(sending){cancelIntent.current=true;return}if(job)await operation(async()=>{await cancelGemini(job);wakeConverter();notifyTasksChanged();await detail.reload()})},
    // App-provided shortcuts use the original homepage follow-up chip UI.
    suggestions:message?.reply && !pending ? (/\p{Script=Han}/u.test(job?.prompt || '') ? ['继续详细解释','总结关键要点'] : ['Explain this in more detail.','Summarize the key points.']).map(prompt=>({prompt})) : [],
    adapters:{...speechAdapters,attachments:markdownAttachmentAdapter,threadList},
  })
  useLayoutEffect(()=>{runtimeRef.current=runtime},[runtime])
  const feedback = useCallback(async (messageId:string,type:'positive'|'negative',comment?:string)=>{
    const record=[message,...priorMessages].find(item=>item?.id===messageId)
    if(!record)throw new Error('消息尚未加载')
    await submitGeminiFeedback(record.job,record.id,type,comment)
    if(message?.id===messageId)detail.setData(current=>current ? {...current,feedback:type,feedbackComment:comment} : current)
    ancestors.setData(current=>current ? {...current,messages:current.messages.map(item=>item.id===messageId ? {...item,feedback:type,feedbackComment:comment} : item)} : current)
  },[message,priorMessages,detail.setData,ancestors.setData])
  return {runtime,id,threadRoot,job,message,priorMessages,view,detail,progress,ancestors,catalog,config,selected:segment?.id ?? '',setSelected,
    threads:[...families.values()],model:effectiveModel,setModel,effort:effectiveEffort,setEffort,open,pending,feedback,
    error:error || config.error || catalog.error || view.error || detail.error || progress.error || ancestors.error,setError}
}
export type GeminiBackend = ReturnType<typeof useGeminiBackend>
