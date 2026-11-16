import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useExternalStoreRuntime, MessageNotSentError, type AppendMessage } from '@assistant-ui/react'
import { useAsyncData } from '@/hooks/use-async-data'
import { cancelGemini, createGemini, deleteGeminiThread, getGeminiAncestors, getGeminiConfig, getGeminiMessage, getGeminiView, listGeminiThreads, updateGeminiThread } from '@/lib/api/gemini'
import { newRecordId } from '@/lib/api/file-conversion'
import { wakeConverter } from '@/lib/api/converter-dispatcher'
import { geminiTextKind, notifyTasksChanged } from '@/lib/tasks'
import { toErrorMessage } from '@/lib/api/errors'
import type { GeminiInput } from '@/types/gemini'
import { toThreadMessages } from '../lib/thread-messages'
import { inputSources, markdownAttachmentAdapter } from '../lib/markdown-attachments'

export function useGeminiBackend() {
  const [params, setParams] = useSearchParams()
  const id = params.get('job')
  const [selected, setSelected] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const locked = useRef(false)
  const submission = useRef<{ key: string; id: string } | null>(null)
  const config = useAsyncData(getGeminiConfig, [])
  const catalog = useAsyncData(listGeminiThreads, [], { pollMs: data => data?.some(job => geminiTextKind.isActive(job.status)) ? 5000 : 30000 })
  const view = useAsyncData(signal => id ? getGeminiView(id, signal) : Promise.resolve(null), [id], {
    cacheKey: id ? `official-gemini-view:${id}` : undefined, pollMs: data => data && geminiTextKind.isActive(data.job.status) ? 3000 : 30000,
  })
  const job = view.data?.job.id === id ? view.data.job : null
  const segment = job ? view.data?.messages.find(item => item.id === selected) ?? view.data?.messages[0] : undefined
  const detail = useAsyncData(signal => id && segment ? getGeminiMessage(id, segment.id, signal) : Promise.resolve(null),
    [id, segment?.id, segment?.status, segment?.updated], { cacheKey: id && segment ? `official-gemini-message:${id}:${segment.id}` : undefined,
      pollMs: data => data && ['queued', 'running'].includes(data.status) ? 3000 : 30000 })
  const message = detail.data?.id === segment?.id ? detail.data : null
  const ancestors = useAsyncData(async signal => ({ jobId: id, messages: job && catalog.data ? await getGeminiAncestors(job, catalog.data, signal) : [] }),
    [id, job?.parentMessage, Boolean(catalog.data)], { enabled: Boolean(job && catalog.data), cacheKey: id ? `official-gemini-ancestors:${id}` : undefined })
  const pending = Boolean(job && geminiTextKind.isActive(job.status))
  const effectiveModel = model || job?.model || config.data?.config.model || 'gemini-3.5-flash-lite'
  const messages = useMemo(() => job && message ? toThreadMessages(job, message, ancestors.data?.jobId === id ? ancestors.data.messages : []) : [], [id, job, message, ancestors.data])
  const open = useCallback((nextId: string | null) => {
    setError(''); setSelected(''); setModel(''); submission.current = null
    setParams(current => { const next = new URLSearchParams(current); if (nextId) next.set('job', nextId); else next.delete('job'); return next }, { replace: true })
  }, [setParams])
  const onNew = useCallback(async (input: AppendMessage) => {
    if (locked.current) throw new Error('A message is already being submitted')
    locked.current = true; setSending(true); setError('')
    try {
      if (!config.data) throw new Error('请等待消息配置加载完成')
      const prompt = input.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
      const payload: GeminiInput = { ...config.data.config, responseVersion: 1, title: '', text: '', prompt,
        sources: inputSources(input), model: effectiveModel, ...(message?.reply && !pending ? { parentMessage: message.id } : {}) }
      const key = JSON.stringify(payload)
      if (submission.current?.key !== key) submission.current = { key, id: newRecordId() }
      const created = await createGemini(submission.current.id, payload)
      submission.current = null
      wakeConverter(); notifyTasksChanged()
      await catalog.reload()
      open(created.id)
    } catch (cause) { setError(toErrorMessage(cause)); throw new MessageNotSentError(toErrorMessage(cause)) }
    finally { locked.current = false; setSending(false) }
  }, [config.data, effectiveModel, message?.id, message?.reply, pending, catalog.reload, open])
  const operation = useCallback(async (action: () => Promise<unknown>, refreshView = true) => {
    setError('')
    try { await action(); await catalog.reload(); if (refreshView) await view.reload() }
    catch (cause) { setError(toErrorMessage(cause)); throw cause }
  }, [catalog.reload, view.reload])
  const families = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof catalog.data>[number]>()
    for (const job of catalog.data ?? []) {
      const root = job.threadRoot || job.id
      if (!latest.has(root)) latest.set(root, job)
    }
    return latest
  }, [catalog.data])
  const threadList = useMemo(() => ({
    threadId: job?.threadRoot || id || undefined, isLoading: catalog.loading,
    threads: [...families].filter(([, job]) => !job.archived).map(([root, job]) => ({ id: root, title: job.title, status: 'regular' as const, lastMessageAt: new Date(job.updated) })),
    archivedThreads: [...families].filter(([, job]) => job.archived).map(([root, job]) => ({ id: root, title: job.title, status: 'archived' as const })),
    onSwitchToNewThread: () => open(null), onSwitchToThread: (value: string) => open(families.get(value)?.id || value),
    onRename: (value: string, title: string) => operation(() => updateGeminiThread(families.get(value)?.id || value, { title })),
    onArchive: (value: string) => operation(() => updateGeminiThread(families.get(value)?.id || value, { archived: true })),
    onUnarchive: (value: string) => operation(() => updateGeminiThread(families.get(value)?.id || value, { archived: false })),
    onDelete: (value: string) => operation(async () => { await deleteGeminiThread(families.get(value)?.id || value); notifyTasksChanged(); if (value === (job?.threadRoot || id)) open(null) }, false),
  }), [id, job?.threadRoot, families, catalog.loading, open, operation])
  const runtime = useExternalStoreRuntime({ messages, convertMessage: value => value, onNew,
    isRunning: pending || sending, isLoading: Boolean(id && (!job || !message) && (view.loading || detail.loading)),
    isSendDisabled: sending || pending || !config.data || Boolean(id && (!message?.reply || !job)),
    onCancel: async () => { if (job) await operation(async () => { await cancelGemini(job); wakeConverter(); notifyTasksChanged(); await detail.reload() }) },
    adapters: { attachments: markdownAttachmentAdapter, threadList },
  })
  return { runtime, id, job, message, view, detail, ancestors, catalog, config, selected: segment?.id ?? '', setSelected,
    threads: [...families.values()], model: effectiveModel, setModel, open, pending, error: error || config.error || catalog.error || view.error || detail.error || ancestors.error, setError }
}
export type GeminiBackend = ReturnType<typeof useGeminiBackend>
