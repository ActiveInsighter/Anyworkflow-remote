import { useCallback, useMemo, useState } from 'react'
import { useExternalStoreRuntime, type AppendMessage } from '@assistant-ui/react'
import { useAsyncData } from '@/hooks/use-async-data'
import { getGeminiMessage, getGeminiView } from '@/lib/api/gemini'
import { geminiTextKind } from '@/lib/tasks'
import { toThreadMessages } from '../lib/thread-messages'

export function useGeminiThread(id: string | null, onSend: (text: string, parentMessage?: string) => Promise<void>, onCancel: () => Promise<void>) {
  const [selected, setSelected] = useState('')
  const view = useAsyncData(signal => id ? getGeminiView(id, signal) : Promise.resolve(null), [id], {
    pollMs: data => data && geminiTextKind.isActive(data.job.status) ? 3000 : 30000,
  })
  const segment = view.data?.messages.find(item => item.id === selected) ?? view.data?.messages[0]
  const detail = useAsyncData(signal => id && segment ? getGeminiMessage(id, segment.id, signal) : Promise.resolve(null),
    [id, segment?.id, segment?.status, segment?.updated], {
      cacheKey: id && segment ? `gemini-message:${id}:${segment.id}` : undefined,
      pollMs: data => data && ['queued', 'running'].includes(data.status) ? 3000 : 30000,
    })
  const job = view.data?.job
  const message = detail.data?.id === segment?.id ? detail.data : null
  const pending = Boolean(job && geminiTextKind.isActive(job.status))
  const messages = useMemo(() => job && message ? toThreadMessages(job, message) : [], [job, message])
  const onNew = useCallback(async (input: AppendMessage) => {
    const text = input.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    await onSend(text, message?.reply && !pending ? message.id : undefined)
  }, [onSend, message?.id, message?.reply, pending])
  const runtime = useExternalStoreRuntime({
    messages, convertMessage: message => message, onNew, onCancel,
    isRunning: pending, isLoading: Boolean(id && view.loading),
    isSendDisabled: pending || Boolean(id && (!job || !message || !message.reply)),
  })
  return { runtime, view, detail, job, segment, selected, setSelected, pending }
}
