import { useRef, useState } from 'react'
import { useAsyncData } from '@/hooks/use-async-data'
import { useAsyncAction } from '@/hooks/use-async-action'
import { cancelGemini, createGemini, deleteGeminiJob, listGeminiJobs } from '@/lib/api/gemini'
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
    if (locked.current) return undefined
    locked.current = true
    const key = JSON.stringify(input)
    if (submission.current?.key !== key) submission.current = { key, id: newRecordId() }
    const id = submission.current.id
    try {
      return await creating.run('create', async () => {
        const job = await createGemini(id, input)
        submission.current = null
        wakeConverter(); notifyTasksChanged()
        if (page === 1) await data.reload()
        else setPage(1)
        return job
      }, { failure: false, success: '消息已发送' })
    } finally { locked.current = false }
  }
  function cancel(job: GeminiJob) {
    void action.run(job.id, async () => {
      await cancelGemini(job); wakeConverter(); notifyTasksChanged(); await data.reload()
    }, { failure: false, success: '已请求结束任务，已保存的回复保留' })
  }
  async function remove(job: GeminiJob) {
    return action.run(job.id, async () => {
      await deleteGeminiJob(job.id)
      notifyTasksChanged()
      if (data.data?.items.length === 1 && page > 1) setPage(page - 1)
      else await data.reload()
      return true
    }, { success: '消息已删除' })
  }
  return { data, page, setPage, creating, action, create, cancel, remove }
}
