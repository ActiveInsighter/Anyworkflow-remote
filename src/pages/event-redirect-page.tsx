import { useParams } from 'react-router'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page } from '@/components/layout/page'
import { getEvent, getTask } from '@/lib/api'
import { useRedirect } from '@/features/runs/hooks/use-redirect'
import { eventDeepLink } from '@/features/runs/lib/deep-link'

/** Legacy `/events/:id` links: Events expand under their Task on the Run page. */
export function EventRedirectPage() {
  const { eventId = '' } = useParams()
  const error = useRedirect(
    eventId
      ? async () => {
          const event = await getEvent(eventId)
          return eventDeepLink(await getTask(event.task), event)
        }
      : null,
    eventId,
  )
  return <Page>{error ? <ErrorAlert>{error}</ErrorAlert> : <LoadingState />}</Page>
}
