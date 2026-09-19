import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppPage, ErrorBanner, LoadingState } from '@/components/app/ui'
import { getTask, toErrorMessage } from '@/lib/api'

/** Legacy deep-link compatibility: Task content now lives inside the Run hierarchy. */
export function TaskDetailPage() {
  const { taskId = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!taskId) return
    let active = true
    void getTask(taskId)
      .then((task) => {
        if (active) navigate(`/runs/${task.run}?task=${task.id}&taskPage=${Math.floor(task.runIndex / 20) + 1}`, { replace: true })
      })
      .catch((cause) => active && setError(toErrorMessage(cause)))
    return () => { active = false }
  }, [navigate, taskId])

  return <AppPage>{error ? <ErrorBanner>{error}</ErrorBanner> : <LoadingState />}</AppPage>
}
