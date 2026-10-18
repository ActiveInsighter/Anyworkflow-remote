import { useParams } from 'react-router'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page } from '@/components/layout/page'
import { getTask } from '@/lib/api'
import { useRedirect } from '@/features/runs/hooks/use-redirect'
import { taskDeepLink } from '@/features/runs/lib/deep-link'

/** Legacy `/tasks/:id` links: Task content now lives inside the Run hierarchy. */
export function TaskRedirectPage() {
  const { taskId = '' } = useParams()
  const error = useRedirect(taskId ? async () => taskDeepLink(await getTask(taskId)) : null, taskId)
  return <Page>{error ? <ErrorAlert>{error}</ErrorAlert> : <LoadingState />}</Page>
}
