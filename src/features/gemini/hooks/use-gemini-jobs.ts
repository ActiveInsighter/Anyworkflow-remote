import { useRef, useState } from 'react'
import { useAsyncData } from '@/hooks/use-async-data'
import { useAsyncAction } from '@/hooks/use-async-action'
import { cancelGemini, createGemini, listGeminiJobs } from '@/lib/api/gemini'
import { newRecordId } from '@/lib/api/file-conversion'
import { wakeConverter } from '@/lib/api/converter-dispatcher'
import { geminiTextKind, notifyTasksChanged } from '@/lib/tasks'
import type { GeminiInput, GeminiJob } from '@/types/gemini'

export function useGeminiJobs() {
  const [page, setPage] = useState(1)
  const data = useAsyncData(signal => listGeminiJobs(page, signal), [page], { pollMs: data => data?.items.some(job => geminiTextKind.isActive(job.status)) ? 5000 : 30000 })
  const creating = useAsyncAction()
  const action = useAsyncAction()
  const submission = useRef<{ key: string; id: string } | null>(null)
  const locked = useRef(false)
  async function create(input: GeminiInput) {
    if (locked.current) return false
    locked.current = true
    const key = JSON.stringify(input)
    if (submission.current?.key !== key) submission.current = { key, id: newRecordId() }
    const id = submission.current.id
    try {
      return Boolean(await creating.run('create', async () => {
        await createGemini(id, input)
        submission.current = null
        wakeConverter(); notifyTasksChanged()
        if (page === 1) await data.reload()
        else setPage(1)
        return true
      }, { failure: false, success: '消息已提交，回复会逐段保存' }))
    } finally { locked.current = false }
  }
  function cancel(job: GeminiJob) {
    void action.run(job.id, async () => {
      await cancelGemini(job); wakeConverter(); notifyTasksChanged(); await data.reload()
    }, { failure: false, success: '已请求结束任务，已保存的回复保留' })
  }
  return { data, page, setPage, creating, action, create, cancel }
}
