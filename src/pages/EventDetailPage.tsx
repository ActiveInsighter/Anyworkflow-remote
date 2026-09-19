import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppPage, ErrorBanner, LoadingState } from '@/components/app/ui'
import { getEvent, getTask, toErrorMessage } from '@/lib/api'

/** Legacy deep-link compatibility: Event/Act content now expands under its Task on the Run page. */
export function EventDetailPage() {
  const { eventId = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!eventId) return
    let active = true
    void getEvent(eventId)
      .then(async (event) => ({ event, task: await getTask(event.task) }))
      .then(({ event, task }) => {
        if (active) navigate(`/runs/${task.run}?task=${task.id}&event=${event.id}&taskPage=${Math.floor(task.runIndex / 20) + 1}&eventPage=${Math.floor(event.eventIndex / 20) + 1}`, { replace: true })
      })
      .catch((cause) => active && setError(toErrorMessage(cause)))
    return () => { active = false }
  }, [eventId, navigate])

  return <AppPage>{error ? <ErrorBanner>{error}</ErrorBanner> : <LoadingState />}</AppPage>
}
